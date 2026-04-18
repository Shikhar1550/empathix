"""
Speech-to-Text Engine for EMPATHIX
Uses OpenAI Whisper (local model) for fast, accurate transcription.
Supports multilingual (English, Hindi, etc.)
"""

import os
import asyncio
import warnings
from pathlib import Path
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
import concurrent.futures

import numpy as np

# Suppress Whisper warnings
warnings.filterwarnings("ignore", message=".*FP16 is not supported.*")
warnings.filterwarnings("ignore", message=".*torch.*");

# =============================================================================
# Global Model State
# =============================================================================

_whisper_model = None
_model_loading = False
_model_error = None

# Thread pool executor for running Whisper in background
_executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)

# Default model size - "base" is good balance of speed and accuracy
DEFAULT_MODEL_SIZE = "base"


def load_whisper_model(model_size: str = DEFAULT_MODEL_SIZE) -> bool:
    """
    Load Whisper model once at startup.

    Args:
        model_size: Whisper model size (tiny, base, small, medium, large)

    Returns:
        True if model loaded successfully, False otherwise
    """
    global _whisper_model, _model_loading, _model_error

    if _whisper_model is not None:
        return True

    if _model_loading:
        # Wait for loading to complete
        import time
        timeout = 60
        start = time.time()
        while _model_loading and time.time() - start < timeout:
            time.sleep(0.1)
        return _whisper_model is not None

    _model_loading = True
    _model_error = None

    try:
        import whisper

        print(f"[STT] Loading Whisper model '{model_size}'...")
        _whisper_model = whisper.load_model(model_size)
        print(f"[STT] Whisper model '{model_size}' loaded successfully")
        return True

    except Exception as e:
        _model_error = str(e)
        print(f"[STT] Failed to load Whisper model: {e}")
        return False

    finally:
        _model_loading = False


def is_model_loaded() -> bool:
    """Check if Whisper model is loaded and ready."""
    return _whisper_model is not None


def get_model_error() -> Optional[str]:
    """Get model loading error if any."""
    return _model_error


# =============================================================================
# Core Transcription
# =============================================================================

def _transcribe_sync(filepath: str) -> Dict[str, Any]:
    """
    Synchronous transcription using Whisper.
    Runs in thread pool to avoid blocking.

    Args:
        filepath: Path to audio file (should be 16kHz WAV)

    Returns:
        Dictionary with transcription results
    """
    global _whisper_model

    # Ensure model is loaded
    if _whisper_model is None:
        if not load_whisper_model():
            return {
                "text": "",
                "language": "",
                "confidence": 0.0,
                "words": [],
                "duration": 0.0,
                "error": "Whisper model not loaded"
            }

    path = Path(filepath)
    if not path.exists():
        return {
            "text": "",
            "language": "",
            "confidence": 0.0,
            "words": [],
            "duration": 0.0,
            "error": f"File not found: {filepath}"
        }

    try:
        # Load audio with soundfile (no ffmpeg needed)
        import whisper
        import soundfile as sf
        import librosa
        import numpy as np

        SAMPLE_RATE = 16000  # Whisper uses 16kHz

        # First try soundfile (for wav files)
        try:
            audio, sr = sf.read(str(filepath), dtype='float32')
            # Convert to mono if stereo
            if len(audio.shape) > 1:
                audio = np.mean(audio, axis=1)
            # Resample to 16kHz if needed
            if sr != SAMPLE_RATE:
                audio = librosa.resample(audio, orig_sr=sr, target_sr=SAMPLE_RATE)
        except Exception:
            # Fallback to librosa for other formats
            audio, sr = librosa.load(str(filepath), sr=SAMPLE_RATE, mono=True)

        # Get duration before processing
        duration = len(audio) / SAMPLE_RATE

        # Pad/trim to 30 seconds max (Whisper's limit)
        audio = whisper.pad_or_trim(audio)

        # Make log-Mel spectrogram
        mel = whisper.log_mel_spectrogram(audio).to(_whisper_model.device)

        # Detect language
        _, probs = _whisper_model.detect_language(mel)
        detected_lang = max(probs, key=probs.get)
        lang_confidence = float(probs[detected_lang])

        # Decode options - multilingual support
        decode_options = {
            "language": detected_lang,
            "task": "transcribe",
            "fp16": False,  # Use FP32 for compatibility
        }

        # Run transcription
        result = _whisper_model.transcribe(
            str(filepath),
            **decode_options
        )

        # Extract text
        text = result.get("text", "").strip()

        # If no text detected, return empty with low confidence
        if not text:
            return {
                "text": "",
                "language": detected_lang,
                "confidence": 0.0,
                "words": [],
                "duration": duration
            }

        # Calculate confidence from segment-level data
        segments = result.get("segments", [])
        if segments:
            # Average confidence across segments
            confidences = []
            for seg in segments:
                # Whisper doesn't give direct confidence, use avg_log_prob
                log_prob = seg.get("avg_log_prob", -1.0)
                # Convert log probability to approximate confidence (0-1)
                # Higher (less negative) log prob = higher confidence
                conf = min(max((log_prob + 1.0) / 1.0, 0.0), 1.0)
                if conf < 0:
                    conf = 0.0
                confidences.append(conf)

            avg_confidence = float(np.mean(confidences)) if confidences else 0.5
        else:
            avg_confidence = lang_confidence * 0.8  # Fallback to language confidence

        # Extract words from segments
        words = []
        for seg in segments:
            seg_text = seg.get("text", "").strip()
            if seg_text:
                # Simple word tokenization
                seg_words = seg_text.split()
                words.extend(seg_words)

        # Clean up text
        text = text.replace("  ", " ").strip()

        return {
            "text": text,
            "language": detected_lang,
            "confidence": round(avg_confidence, 3),
            "words": words,
            "duration": round(duration, 2)
        }

    except Exception as e:
        return {
            "text": "",
            "language": "",
            "confidence": 0.0,
            "words": [],
            "duration": 0.0,
            "error": str(e)
        }


async def transcribe(filepath: str) -> Dict[str, Any]:
    """
    Transcribe audio file using Whisper.
    Runs in thread pool to avoid blocking FastAPI event loop.

    Args:
        filepath: Path to audio file (WAV format, 16kHz preferred)

    Returns:
        Dictionary with:
        - text: Transcribed text string
        - language: Detected language code (en, hi, etc.)
        - confidence: Transcription confidence (0-1)
        - words: List of individual words
        - duration: Audio duration in seconds
        - error: Error message if failed (optional)

    Example:
        result = await transcribe("audio.wav")
        # Returns:
        # {
        #   "text": "I am happy today",
        #   "language": "en",
        #   "confidence": 0.92,
        #   "words": ["I", "am", "happy", "today"],
        #   "duration": 2.3
        # }
    """
    loop = asyncio.get_event_loop()

    try:
        # Run blocking Whisper transcription in thread pool
        result = await loop.run_in_executor(_executor, _transcribe_sync, filepath)
        return result
    except Exception as e:
        return {
            "text": "",
            "language": "",
            "confidence": 0.0,
            "words": [],
            "duration": 0.0,
            "error": f"Transcription failed: {str(e)}"
        }


# =============================================================================
# Language Detection
# =============================================================================

def _detect_language_sync(filepath: str) -> str:
    """
    Synchronous language detection using Whisper.

    Args:
        filepath: Path to audio file

    Returns:
        Language code (en, hi, etc.) or empty string if failed
    """
    global _whisper_model

    if _whisper_model is None:
        if not load_whisper_model():
            return ""

    path = Path(filepath)
    if not path.exists():
        return ""

    try:
        import whisper
        audio = whisper.load_audio(str(filepath))
        audio = whisper.pad_or_trim(audio)
        mel = whisper.log_mel_spectrogram(audio).to(_whisper_model.device)

        _, probs = _whisper_model.detect_language(mel)
        detected_lang = max(probs, key=probs.get)

        return detected_lang

    except Exception:
        return ""


async def language_detect(filepath: str) -> str:
    """
    Detect language of audio file.

    Args:
        filepath: Path to audio file

    Returns:
        Language code (e.g., "en", "hi", "es") or empty string

    Example:
        lang = await language_detect("audio.wav")
        # Returns: "en" for English, "hi" for Hindi, etc.
    """
    loop = asyncio.get_event_loop()

    try:
        lang = await loop.run_in_executor(_executor, _detect_language_sync, filepath)
        return lang
    except Exception:
        return ""


# =============================================================================
# Batch Processing
# =============================================================================

async def transcribe_batch(filepaths: List[str]) -> List[Dict[str, Any]]:
    """
    Transcribe multiple audio files concurrently.

    Args:
        filepaths: List of audio file paths

    Returns:
        List of transcription result dictionaries
    """
    tasks = [transcribe(fp) for fp in filepaths]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Convert exceptions to error results
    processed_results = []
    for result in results:
        if isinstance(result, Exception):
            processed_results.append({
                "text": "",
                "language": "",
                "confidence": 0.0,
                "words": [],
                "duration": 0.0,
                "error": str(result)
            })
        else:
            processed_results.append(result)

    return processed_results


# =============================================================================
# Utilities
# =============================================================================

def cleanup():
    """Clean up resources."""
    global _whisper_model, _executor

    _whisper_model = None

    if _executor:
        _executor.shutdown(wait=False)
        _executor = None


def get_supported_languages() -> List[str]:
    """
    Get list of languages supported by Whisper.

    Returns:
        List of language codes
    """
    try:
        import whisper
        return list(whisper.tokenizer.LANGUAGES.keys())
    except Exception:
        # Common languages if import fails
        return ["en", "hi", "es", "fr", "de", "zh", "ja", "ar", "ru", "pt"]


def language_code_to_name(code: str) -> str:
    """
    Convert language code to human-readable name.

    Args:
        code: Language code (e.g., "en", "hi")

    Returns:
        Language name (e.g., "English", "Hindi")
    """
    language_names = {
        "en": "English",
        "hi": "Hindi",
        "es": "Spanish",
        "fr": "French",
        "de": "German",
        "zh": "Chinese",
        "ja": "Japanese",
        "ar": "Arabic",
        "ru": "Russian",
        "pt": "Portuguese",
        "it": "Italian",
        "ko": "Korean",
        "nl": "Dutch",
        "tr": "Turkish",
        "pl": "Polish",
        "vi": "Vietnamese",
        "id": "Indonesian",
        "th": "Thai",
        "fa": "Persian",
        "ur": "Urdu",
        "ta": "Tamil",
        "te": "Telugu",
        "mr": "Marathi",
        "gu": "Gujarati",
        "kn": "Kannada",
        "ml": "Malayalam",
        "pa": "Punjabi",
        "bn": "Bengali",
    }
    return language_names.get(code, code.upper())


# =============================================================================
# Test
# =============================================================================

if __name__ == "__main__":
    print("=" * 60)
    print("EMPATHIX STT Engine - Test Mode")
    print("=" * 60)

    # Find test file
    test_dir = Path(__file__).parent
    test_file = test_dir / "test.wav"

    if not test_file.exists():
        print(f"\nNo test.wav found in {test_dir}")
        print("\nTo test, add a test.wav file and run again.")
        exit(1)

    print(f"\nTest file: {test_file}")
    print(f"Size: {test_file.stat().st_size / 1024:.1f} KB")
    print("\n" + "-" * 60)

    async def run_test():
        # Test language detection first
        print("\n[1] Detecting language...")
        lang = await language_detect(str(test_file))
        print(f"    Detected: {lang} ({language_code_to_name(lang)})")

        # Test transcription
        print("\n[2] Transcribing audio...")
        result = await transcribe(str(test_file))

        if "error" in result and result["error"]:
            print(f"    ERROR: {result['error']}")
        else:
            print(f"    Text: '{result['text']}'")
            print(f"    Language: {result['language']}")
            print(f"    Confidence: {result['confidence']:.3f}")
            print(f"    Words: {result['words']}")
            print(f"    Duration: {result['duration']:.2f}s")

        print("\n" + "=" * 60)
        print("Test complete!")

    # Run async test
    asyncio.run(run_test())
