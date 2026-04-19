"""
Audio Processing Module for EMPATHIX
Handles saving, conversion, feature extraction, and normalization of audio files.
"""

import os
import tempfile
import subprocess
import shutil
import asyncio
import warnings
from typing import Optional, Dict, Any, Tuple
from pathlib import Path
from dataclasses import dataclass

import numpy as np
import librosa
import soundfile as sf

# =============================================================================
# Configuration
# =============================================================================

@dataclass
class AudioConfig:
    """Configuration for audio processing."""
    target_sample_rate: int = 16000
    silence_threshold: float = 0.01
    min_duration: float = 0.5
    max_duration: float = 10.0
    clipping_threshold: float = 0.99
    target_rms_db: float = -20.0
    temp_audio_dir: Path = Path("temp_audio")


# Global config
CONFIG = AudioConfig()
CONFIG.temp_audio_dir.mkdir(exist_ok=True)

# Get ffmpeg path from imageio-ffmpeg if available
try:
    from imageio_ffmpeg import get_ffmpeg_exe
    FFMPEG_PATH = get_ffmpeg_exe()
except ImportError:
    FFMPEG_PATH = shutil.which("ffmpeg")

# Configure pydub if available
try:
    from pydub import AudioSegment
    if FFMPEG_PATH:
        AudioSegment.converter = FFMPEG_PATH
    PYDUB_AVAILABLE = True
except ImportError:
    PYDUB_AVAILABLE = False


# =============================================================================
# Audio Saving and Conversion
# =============================================================================

def save_audio_file(audio_bytes: bytes) -> str:
    """
    Save incoming audio blob to temp file and convert to 16kHz mono WAV.

    Supports .webm (MediaRecorder default), .wav, .ogg, .mp3, .m4a formats.
    Automatically detects format from file signature and converts.

    Args:
        audio_bytes: Raw audio bytes from browser/blob

    Returns:
        Path to saved 16kHz mono WAV file

    Raises:
        ValueError: If audio format is unsupported or invalid
        RuntimeError: If conversion fails
    """
    if not audio_bytes or len(audio_bytes) < 1200:
        raise ValueError("Audio was too short or incomplete. Please try speaking again.")

    # Create temp file with detected extension
    detected_ext = _detect_format_from_bytes(audio_bytes)
    temp_input = tempfile.NamedTemporaryFile(
        suffix=f".{detected_ext}",
        dir=CONFIG.temp_audio_dir,
        delete=False
    )
    temp_input_path = Path(temp_input.name)
    temp_input.close()

    try:
        # Write bytes to temp file
        temp_input_path.write_bytes(audio_bytes)

        # Convert to 16kHz mono WAV
        temp_output = tempfile.NamedTemporaryFile(
            suffix=".wav",
            dir=CONFIG.temp_audio_dir,
            delete=False
        )
        temp_output_path = Path(temp_output.name)
        temp_output.close()

        try:
            _convert_to_wav(temp_input_path, temp_output_path, detected_ext)
            return str(temp_output_path)
        except Exception as e:
            if temp_output_path.exists():
                temp_output_path.unlink()
            raise RuntimeError(f"Audio conversion failed: {str(e)}") from e
        finally:
            if temp_input_path.exists():
                temp_input_path.unlink()

    except Exception:
        if temp_input_path.exists():
            temp_input_path.unlink()
        raise


def _detect_format_from_bytes(audio_bytes: bytes) -> str:
    """Detect audio format from bytes signature."""
    if len(audio_bytes) < 12:
        return "webm"  # Default assumption

    header = audio_bytes[:12]

    # RIFF/WAVE format
    if header[:4] == b'RIFF' and header[8:12] == b'WAVE':
        return 'wav'

    # WebM/Matroska format
    if header[:4] == b'\x1a\x45\xdf\xa3':
        return 'webm'

    # Ogg format
    if header[:4] == b'OggS':
        return 'ogg'

    # MP3 ID3 format
    if header[:3] == b'ID3':
        return 'mp3'

    # MP3 sync word
    if header[:2] == b'\xff\xfb' or header[:2] == b'\xff\xf3':
        return 'mp3'

    # M4A/AAC (ISO base media file format)
    if header[4:8] == b'ftyp':
        return 'm4a'

    return 'unknown'


def _convert_to_wav(input_path: Path, output_path: Path, input_format: str) -> None:
    """
    Convert audio file to 16kHz mono WAV using best available method.

    Priority: ffmpeg → pydub → librosa fallback

    Args:
        input_path: Input audio file path
        output_path: Output WAV file path
        input_format: Detected input format

    Raises:
        RuntimeError: If all conversion methods fail
    """
    errors = []

    # Method 1: ffmpeg (most reliable for webm/ogg)
    if FFMPEG_PATH and os.path.exists(FFMPEG_PATH):
        ffmpeg_attempts = [True, False] if input_format == "webm" else [False]

        for use_format_hint in ffmpeg_attempts:
            cmd = [
                FFMPEG_PATH,
                "-y",
                "-fflags", "+discardcorrupt",  # Handle corrupted headers
                "-err_detect", "ignore_err",   # Ignore decode errors
            ]

            # For WebM, try a format hint first, then retry without it. Some
            # browser blobs have odd headers after rapid stop/start cycles.
            if input_format == "webm" and use_format_hint:
                cmd.extend(["-f", "webm"])

            cmd.extend([
                "-i", str(input_path),
                "-ar", str(CONFIG.target_sample_rate),
                "-ac", "1",
                "-acodec", "pcm_s16le",
                "-loglevel", "error",
                str(output_path)
            ])

            try:
                subprocess.run(
                    cmd,
                    check=True,
                    capture_output=True,
                    timeout=30
                )
                return
            except subprocess.CalledProcessError as e:
                stderr = e.stderr.decode('utf-8', errors='ignore')[:150] if e.stderr else "unknown error"
                label = "ffmpeg-webm" if use_format_hint else "ffmpeg"
                errors.append(f"{label}: {stderr}")
            except Exception as e:
                label = "ffmpeg-webm" if use_format_hint else "ffmpeg"
                errors.append(f"{label}: {str(e)}")

    # Method 2: pydub (good for various formats)
    if PYDUB_AVAILABLE:
        try:
            pydub_format = None if input_format == "unknown" else input_format
            audio = AudioSegment.from_file(input_path, format=pydub_format)
            audio = audio.set_channels(1).set_frame_rate(CONFIG.target_sample_rate)
            audio.export(output_path, format="wav")
            return
        except Exception as e:
            errors.append(f"pydub: {str(e)}")

    # Method 3: librosa + soundfile (works for wav/mp3, limited webm support)
    try:
        # Suppress any SpeechBrain lazy import warnings during librosa load
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            audio, sr = librosa.load(input_path, sr=CONFIG.target_sample_rate, mono=True)
        sf.write(output_path, audio, CONFIG.target_sample_rate, subtype='PCM_16')
        return
    except Exception as e:
        errors.append(f"librosa: {str(e)}")

    # All methods failed
    raise RuntimeError(f"All conversion methods failed: {'; '.join(errors)}")


# =============================================================================
# Feature Extraction
# =============================================================================

def extract_features(filepath: str) -> Optional[Dict[str, float]]:
    """
    Extract comprehensive audio features for emotion detection.

    Features extracted:
    - MFCC: 40 coefficients (mean + std each = 80 values)
    - Pitch: mean, std using librosa.yin (fmin=50Hz, fmax=400Hz)
    - Energy: RMS mean, std
    - Zero crossing rate: mean
    - Spectral centroid: mean
    - Spectral rolloff: mean
    - Tempo: BPM using librosa.beat.tempo
    - Speech rate: zero crossings per second estimate

    Args:
        filepath: Path to 16kHz WAV audio file

    Returns:
        Dictionary of 90+ extracted features, or None if extraction fails

    Raises:
        FileNotFoundError: If audio file doesn't exist
        ValueError: If audio format is invalid
    """
    path = Path(filepath)
    if not path.exists():
        raise FileNotFoundError(f"Audio file not found: {filepath}")

    try:
        # Load audio at target sample rate, mono
        audio, sr = librosa.load(path, sr=CONFIG.target_sample_rate, mono=True)

        if len(audio) == 0:
            raise ValueError("Audio file is empty")

        features = {}

        # === MFCC Features (40 coefficients) ===
        mfccs = librosa.feature.mfcc(
            y=audio,
            sr=sr,
            n_mfcc=40,
            n_fft=512,
            hop_length=160
        )

        # Store mean and std for each of 40 coefficients (80 features total)
        mfcc_means = np.mean(mfccs, axis=1)
        mfcc_stds = np.std(mfccs, axis=1)

        for i in range(40):
            features[f"mfcc_{i}_mean"] = float(mfcc_means[i])
            features[f"mfcc_{i}_std"] = float(mfcc_stds[i])

        # === Pitch Features using YIN ===
        # YIN algorithm for fundamental frequency estimation
        f0 = librosa.yin(
            audio,
            fmin=50,  # Hz
            fmax=400,  # Hz
            sr=sr,
            hop_length=160
        )

        # Remove unvoiced frames (f0=0)
        voiced_f0 = f0[f0 > 0]

        if len(voiced_f0) > 0:
            features["pitch_mean"] = float(np.mean(voiced_f0))
            features["pitch_std"] = float(np.std(voiced_f0))
        else:
            features["pitch_mean"] = 0.0
            features["pitch_std"] = 0.0

        # === Energy Features (RMS) ===
        rms = librosa.feature.rms(y=audio, frame_length=512, hop_length=160)[0]
        features["energy_rms_mean"] = float(np.mean(rms))
        features["energy_rms_std"] = float(np.std(rms))

        # === Zero Crossing Rate ===
        zcr = librosa.feature.zero_crossing_rate(
            audio,
            frame_length=512,
            hop_length=160
        )[0]
        features["zero_crossing_rate_mean"] = float(np.mean(zcr))

        # === Spectral Features ===
        # Spectral centroid
        cent = librosa.feature.spectral_centroid(
            y=audio,
            sr=sr,
            n_fft=512,
            hop_length=160
        )[0]
        features["spectral_centroid_mean"] = float(np.mean(cent))

        # Spectral rolloff (85% of energy)
        rolloff = librosa.feature.spectral_rolloff(
            y=audio,
            sr=sr,
            n_fft=512,
            hop_length=160,
            roll_percent=0.85
        )[0]
        features["spectral_rolloff_mean"] = float(np.mean(rolloff))

        # === Tempo (BPM) ===
        try:
            tempo, _ = librosa.beat.beat_track(y=audio, sr=sr)
            if isinstance(tempo, np.ndarray):
                tempo = tempo[0]
            features["tempo"] = float(tempo)
        except Exception:
            features["tempo"] = 0.0

        # === Speech Rate Estimate ===
        # Calculate zero crossings per second as speech rate proxy
        total_zero_crossings = np.sum(librosa.zero_crossings(audio, pad=False))
        duration = librosa.get_duration(y=audio, sr=sr)
        if duration > 0:
            features["speech_rate"] = float(total_zero_crossings / duration)
        else:
            features["speech_rate"] = 0.0

        # === Duration ===
        features["duration_seconds"] = float(duration)

        return features

    except Exception as e:
        raise ValueError(f"Feature extraction failed: {str(e)}")


# =============================================================================
# Audio Quality Check
# =============================================================================

def audio_quality_check(filepath: str) -> Dict[str, Any]:
    """
    Check audio file quality and suitability for processing.

    Checks:
    - duration_seconds: actual duration
    - is_silence: RMS < 0.01
    - clipping_detected: any sample > 0.99
    - sample_rate_ok: == 16000

    Args:
        filepath: Path to audio file

    Returns:
        Dictionary with:
        - passed: bool (True if all checks pass)
        - reason: str (explanation if failed, "OK" if passed)
        - duration_seconds: float
        - is_silence: bool
        - clipping_detected: bool
        - sample_rate_ok: bool
    """
    path = Path(filepath)
    if not path.exists():
        return {
            "passed": False,
            "reason": f"File not found: {filepath}",
            "duration_seconds": 0.0,
            "is_silence": True,
            "clipping_detected": False,
            "sample_rate_ok": False
        }

    try:
        # Load audio to check sample rate
        info = sf.info(filepath)
        actual_sr = info.samplerate
        duration = info.duration

        result = {
            "duration_seconds": float(duration),
            "is_silence": False,
            "clipping_detected": False,
            "sample_rate_ok": actual_sr == CONFIG.target_sample_rate
        }

        # Check duration limits
        if duration < CONFIG.min_duration:
            result["passed"] = False
            result["reason"] = f"Audio too short: {duration:.2f}s (min: {CONFIG.min_duration}s)"
            return result

        if duration > CONFIG.max_duration:
            result["passed"] = False
            result["reason"] = f"Audio too long: {duration:.2f}s (max: {CONFIG.max_duration}s)"
            return result

        # Load audio data for RMS and clipping check
        audio, _ = librosa.load(filepath, sr=None, mono=True)

        # Check for silence
        rms = np.sqrt(np.mean(audio ** 2))
        result["is_silence"] = rms < CONFIG.silence_threshold

        if result["is_silence"]:
            result["passed"] = False
            result["reason"] = f"Audio is silence (RMS: {rms:.4f} < {CONFIG.silence_threshold})"
            return result

        # Check for clipping
        result["clipping_detected"] = np.any(np.abs(audio) > CONFIG.clipping_threshold)

        if result["clipping_detected"]:
            result["passed"] = False
            result["reason"] = f"Audio clipping detected (samples > {CONFIG.clipping_threshold})"
            return result

        # Check sample rate
        if not result["sample_rate_ok"]:
            result["passed"] = False
            result["reason"] = f"Sample rate mismatch: {actual_sr}Hz (expected {CONFIG.target_sample_rate}Hz)"
            return result

        # All checks passed
        result["passed"] = True
        result["reason"] = "OK"
        return result

    except Exception as e:
        return {
            "passed": False,
            "reason": f"Quality check failed: {str(e)}",
            "duration_seconds": 0.0,
            "is_silence": True,
            "clipping_detected": False,
            "sample_rate_ok": False
        }


# =============================================================================
# Audio Normalization
# =============================================================================

def normalize_audio(filepath: str) -> str:
    """
    Normalize audio file: trim silence and normalize volume.

    Processing steps:
    1. Load audio at 16kHz mono
    2. Trim silence from start/end (top_db=20)
    3. Normalize RMS to -20dB
    4. Save to new temp file

    Args:
        filepath: Path to input audio file

    Returns:
        Path to normalized audio file (new temp file)

    Raises:
        FileNotFoundError: If input file doesn't exist
        ValueError: If normalization fails
    """
    path = Path(filepath)
    if not path.exists():
        raise FileNotFoundError(f"Audio file not found: {filepath}")

    try:
        # Load audio
        audio, sr = librosa.load(filepath, sr=CONFIG.target_sample_rate, mono=True)

        if len(audio) == 0:
            raise ValueError("Audio file is empty")

        # Step 1: Trim silence from start and end
        audio, _ = librosa.effects.trim(audio, top_db=20)

        # Step 2: Normalize RMS to target level (-20dB)
        # Convert dB to linear: RMS = 10^(dB/20)
        target_rms_linear = 10 ** (CONFIG.target_rms_db / 20.0)

        current_rms = np.sqrt(np.mean(audio ** 2))
        if current_rms > 0:
            gain = target_rms_linear / current_rms
            audio = audio * gain

        # Clip to prevent overflow
        audio = np.clip(audio, -1.0, 1.0)

        # Step 3: Save to new temp file
        temp_output = tempfile.NamedTemporaryFile(
            suffix=".wav",
            dir=CONFIG.temp_audio_dir,
            delete=False
        )
        temp_output_path = Path(temp_output.name)
        temp_output.close()

        sf.write(temp_output_path, audio, CONFIG.target_sample_rate, subtype='PCM_16')

        return str(temp_output_path)

    except Exception as e:
        raise ValueError(f"Audio normalization failed: {str(e)}")


# =============================================================================
# Utility Functions
# =============================================================================

def is_silence(filepath: str) -> bool:
    """
    Quick check if audio file contains only silence.

    Args:
        filepath: Path to audio file

    Returns:
        True if audio RMS is below silence threshold
    """
    try:
        audio, sr = librosa.load(filepath, sr=CONFIG.target_sample_rate, mono=True)
        if len(audio) == 0:
            return True
        rms = np.sqrt(np.mean(audio ** 2))
        return rms < CONFIG.silence_threshold
    except Exception:
        return True


def get_audio_duration(filepath: str) -> float:
    """Get audio file duration in seconds."""
    try:
        return float(librosa.get_duration(path=filepath))
    except Exception:
        return 0.0


def cleanup_temp_files() -> int:
    """
    Clean up all temporary audio files.

    Returns:
        Number of files deleted
    """
    count = 0
    if CONFIG.temp_audio_dir.exists():
        for file in CONFIG.temp_audio_dir.glob("*"):
            try:
                file.unlink()
                count += 1
            except Exception:
                pass
    return count


# =============================================================================
# Async Wrappers
# =============================================================================

async def save_audio_file_async(audio_bytes: bytes) -> str:
    """Async wrapper for save_audio_file."""
    return await asyncio.to_thread(save_audio_file, audio_bytes)


async def extract_features_async(filepath: str) -> Optional[Dict[str, float]]:
    """Async wrapper for extract_features."""
    return await asyncio.to_thread(extract_features, filepath)


async def audio_quality_check_async(filepath: str) -> Dict[str, Any]:
    """Async wrapper for audio_quality_check."""
    return await asyncio.to_thread(audio_quality_check, filepath)


async def normalize_audio_async(filepath: str) -> str:
    """Async wrapper for normalize_audio."""
    return await asyncio.to_thread(normalize_audio, filepath)


async def is_silence_async(filepath: str) -> bool:
    """Async wrapper for is_silence."""
    return await asyncio.to_thread(is_silence, filepath)


async def get_audio_duration_async(filepath: str) -> float:
    """Async wrapper for get_audio_duration."""
    return await asyncio.to_thread(get_audio_duration, filepath)


# =============================================================================
# Test
# =============================================================================

if __name__ == "__main__":
    print("=" * 60)
    print("EMPATHIX Audio Processor - Test Mode")
    print("=" * 60)

    # Find test files
    test_dir = Path(__file__).parent
    test_files = list(test_dir.glob("*.wav")) + list(test_dir.glob("*.webm"))

    if not test_files:
        print("\nNo test audio files found!")
        print(f"Place a .wav or .webm file in: {test_dir}")
        exit(1)

    for test_file in test_files[:3]:
        print(f"\n{'-' * 60}")
        print(f"Testing: {test_file.name}")
        print(f"{'-' * 60}")

        try:
            # Quality check
            quality = audio_quality_check(str(test_file))
            print(f"Quality Check: {'PASS' if quality['passed'] else 'FAIL'}")
            print(f"  Reason: {quality['reason']}")
            print(f"  Duration: {quality['duration_seconds']:.2f}s")
            print(f"  Sample Rate OK: {quality['sample_rate_ok']}")
            print(f"  Is Silence: {quality['is_silence']}")
            print(f"  Clipping: {quality['clipping_detected']}")

            if quality["passed"]:
                # Extract features
                features = extract_features(str(test_file))
                print(f"\nFeatures Extracted: {len(features)}")
                print(f"  Pitch mean: {features['pitch_mean']:.2f} Hz")
                print(f"  Energy RMS: {features['energy_rms_mean']:.4f}")
                print(f"  Tempo: {features['tempo']:.1f} BPM")
                print(f"  Speech rate: {features['speech_rate']:.1f} ZC/s")

                # Test normalization
                norm_path = normalize_audio(str(test_file))
                print(f"\nNormalized: {norm_path}")
                norm_quality = audio_quality_check(norm_path)
                print(f"  Normalized quality: {norm_quality['reason']}")

                # Cleanup normalized file
                Path(norm_path).unlink(missing_ok=True)

        except Exception as e:
            print(f"Error: {e}")

    print(f"\n{'=' * 60}")
    print("Test complete!")
