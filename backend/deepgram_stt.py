"""
Deepgram STT Engine for EMPATHIX
Ultra-fast transcription: 3-4 sec → 0.8 sec
Free tier: 200 hours/month
"""

import os
import asyncio
from pathlib import Path
from typing import Dict, Any, Optional
from dotenv import load_dotenv

load_dotenv()

# Deepgram client
_deepgram_client = None
_deepgram_api_key = os.getenv("DEEPGRAM_API_KEY", "").strip()

# Hindi keywords for Hinglish detection
HINDI_WORDS = {
    "yaar", "bhai", "arre", "arey", "na", "toh", "to", "kya", "kahan", "kaisa",
    "kaisi", "acha", "achi", "achha", "achhi", "theek", "thik", "nahi", "nai",
    "haan", "ha", "ji", "bas", "bus", "yeh", "woh", "wo", "mera", "meri", "tera",
    "teri", "tum", "aap", "main", "mai", "mujhe", "mujhko", "tujhe", "tujhko",
    "chahiye", "chahiye", "kar", "karo", "karke", "raha", "rahi", "rahe",
    "gaya", "gayi", "gya", "gyi", "hoga", "hogi", "hai", "hain", "tha", "thi",
    "raha", "rhi", "rkha", "rakha", "rkhi", "rakhi", "liya", "liye", "de",
    "do", "diya", "diye", "le", "lo", "chal", "chalo", "dekho", "sun", "suno",
    "bolo", "bat", "baat", "karo", "kr", "krna", "karna", "krne", "karne",
    "karega", "karegi", "ja", "jao", "jaao", "aa", "aao", "aana", "jaana",
    "khana", "khana", "peena", "pina", "so", "sona", "uth", "uthao", "baith",
    "baitho", "ghar", "office", "school", "dost", "doston", "ladka", "ladki",
    "bacha", "bache", "zindagi", "duniya", "waqt", "samay", "din", "raat",
    "subah", "sham", "der", "jaldi", "abhi", "pehle", "bad", "baad", "mein",
    "me", "se", "ko", "ke", "ki", "ka", "par", "pe", "mein", "tak", "aur",
    "or", "lekin", "magar", "par", "kyunki", "kyoki", "jab", "tab", "agar",
    "to", "nahi", "nai", "sirf", "bahut", "bohot", "jyada", "zada", "kam",
    "thoda", "bahut", "sab", "sabhi", "kuch", "koi", "kisi", "har", "ek",
    "do", "teen", "char", "paanch", "saat", "aath", "nau", "das",
    "mujhse", "tujhse", "isse", "usse", "isse", "unse", "sabse", "sabse",
}


def _detect_hinglish(text: str, whisper_lang: str) -> str:
    """
    Detect if text is Hinglish (Hindi + English mix).

    Args:
        text: Transcribed text
        whisper_lang: Language detected by Whisper (hi, en, etc.)

    Returns:
        Language code: "en", "hi", or "hinglish"
    """
    if not text:
        return whisper_lang

    text_lower = text.lower()
    words = text_lower.split()

    if not words:
        return whisper_lang

    # Count Hindi words
    hindi_count = sum(1 for word in words if word.strip(".,!?;:'\"") in HINDI_WORDS)
    total_words = len(words)

    # If detected Hindi, check for English mix
    if whisper_lang == "hi":
        # Count English words (simple heuristic: not in Hindi dict)
        english_count = total_words - hindi_count
        # If significant English, it's Hinglish
        if english_count >= 2 and english_count / total_words > 0.2:
            return "hinglish"
        return "hi"

    # If detected English, check for Hindi mix
    if whisper_lang == "en":
        if hindi_count >= 2 and hindi_count / total_words > 0.2:
            return "hinglish"
        return "en"

    # Default to whisper's detection
    return whisper_lang


async def transcribe(filepath: str, language: str = None) -> Dict[str, Any]:
    """
    Transcribe audio using Deepgram Nova-2.
    Auto-detects language if not specified.
    """
    # Use multi-language support - Deepgram auto-detects from audio
    """
    Transcribe audio using Deepgram Nova-2 via HTTP API.
    ~300-800ms for short audio vs 3-4 sec with Whisper.

    Args:
        filepath: Path to audio file
        language: Language code (en, hi, etc.)

    Returns:
        Dict with text, language, confidence, words, duration
    """
    api_key = os.getenv("DEEPGRAM_API_KEY", "").strip()

    if not api_key or api_key == "your_key_here":
        return {
            "text": "",
            "language": "",
            "confidence": 0.0,
            "words": [],
            "duration": 0.0,
            "error": "Deepgram not configured"
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
        import httpx

        url = "https://api.deepgram.com/v1/listen"
        params = {
            "model": "nova-2",
            "smart_format": "true",
            "detect_language": "true",  # Auto-detect Hindi/English/Hinglish
            "punctuate": "true",
        }
        headers = {
            "Authorization": f"Token {api_key}",
            "Content-Type": "audio/wav",
        }

        # Read audio file
        with open(filepath, "rb") as audio:
            audio_data = audio.read()

        print(f"[Deepgram] Transcribing {path.name}...")

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, params=params, headers=headers, content=audio_data)

            if response.status_code != 200:
                error_text = response.text
                print(f"[Deepgram] API error: {response.status_code} - {error_text[:200]}")
                return {
                    "text": "",
                    "language": "",
                    "confidence": 0.0,
                    "words": [],
                    "duration": 0.0,
                    "error": f"Deepgram API error: {response.status_code}"
                }

            data = response.json()
            result = data.get("results", {})
            channels = result.get("channels", [])

            if not channels:
                return {
                    "text": "",
                    "language": _detect_hinglish("", language),
                    "confidence": 0.0,
                    "words": [],
                    "duration": 0.0
                }

            channel = channels[0]
            alternatives = channel.get("alternatives", [])

            if not alternatives:
                return {
                    "text": "",
                    "language": _detect_hinglish("", language),
                    "confidence": 0.0,
                    "words": [],
                    "duration": 0.0
                }

            alt = alternatives[0]
            transcript = alt.get("transcript", "")
            confidence = alt.get("confidence", 0.9)

            # Detect Hinglish
            final_lang = _detect_hinglish(transcript, language)

            # Extract words
            words = []
            for word_info in alt.get("words", []):
                word = word_info.get("word", "")
                if word:
                    words.append(word)

            # Get duration from metadata
            metadata = data.get("metadata", {})
            duration = metadata.get("duration", 0.0)

            print(f"[Deepgram] Done: '{transcript[:50]}...' ({len(words)} words, lang={final_lang})")

            return {
                "text": transcript.strip(),
                "language": final_lang,
                "confidence": round(float(confidence), 3),
                "words": words,
                "duration": round(float(duration), 2)
            }

    except Exception as e:
        print(f"[Deepgram] Error: {e}")
        return {
            "text": "",
            "language": "",
            "confidence": 0.0,
            "words": [],
            "duration": 0.0,
            "error": str(e)
        }


def is_available() -> bool:
    """Check if Deepgram is available."""
    api_key = os.getenv("DEEPGRAM_API_KEY", "").strip()
    return bool(api_key and api_key != "your_key_here")


async def transcribe_with_fallback(filepath: str, language: str = "en") -> Dict[str, Any]:
    """
    Try Deepgram first, fallback to Whisper if fails.
    """
    # Try Deepgram first
    if is_available():
        result = await transcribe(filepath, language)
        if "error" not in result or not result["error"]:
            return result
        print(f"[Deepgram] Failed, falling back to Whisper: {result.get('error')}")

    # Fallback to Whisper
    import stt_engine
    return await stt_engine.transcribe(filepath)


# Convenience alias for main.py
async def transcribe_fast(filepath: str) -> Dict[str, Any]:
    """Fast transcription with auto-provider selection."""
    return await transcribe_with_fallback(filepath)


if __name__ == "__main__":
    print("=" * 60)
    print("Deepgram STT Engine - Test Mode")
    print("=" * 60)

    if not is_available():
        print("\n[ERROR] Deepgram not configured.")
        print("Add DEEPGRAM_API_KEY to backend/.env")
        exit(1)

    # Find test file
    test_dir = Path(__file__).parent
    test_file = test_dir / "test.wav"

    if not test_file.exists():
        print(f"\nNo test.wav found in {test_dir}")
        print("Add a test.wav file and run again.")
        exit(1)

    print(f"\nTest file: {test_file}")
    print(f"Size: {test_file.stat().st_size / 1024:.1f} KB")
    print("\n" + "-" * 60)

    async def run_test():
        import time

        print("\n[Deepgram] Transcribing...")
        start = time.time()
        result = await transcribe(str(test_file))
        elapsed = time.time() - start

        if result.get("error"):
            print(f"    ERROR: {result['error']}")
        else:
            print(f"    Text: '{result['text']}'")
            print(f"    Language: {result['language']}")
            print(f"    Confidence: {result['confidence']:.3f}")
            print(f"    Words: {len(result['words'])}")
            print(f"    Duration: {result['duration']:.2f}s")
            print(f"    Response time: {elapsed*1000:.0f}ms")

        print("\n" + "=" * 60)
        print("Test complete!")

    asyncio.run(run_test())
