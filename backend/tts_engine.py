"""
TTS Engine for EMPATHIX
Primary: ElevenLabs API with emotion-based settings
Fallback: pyttsx3
"""

import os
import io
import asyncio
import tempfile
from typing import Optional, Dict, Any, Tuple
from pathlib import Path
from functools import lru_cache

# Try importing pyttsx3
try:
    import pyttsx3
    PYTTSX3_AVAILABLE = True
except ImportError:
    PYTTSX3_AVAILABLE = False

# Try loading environment variables
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# =============================================================================
# Configuration
# =============================================================================

# ElevenLabs emotion settings: stability, similarity_boost, style
ELEVENLABS_SETTINGS = {
    "sad": {"stability": 0.80, "similarity_boost": 0.70, "style": 0.20},
    "happy": {"stability": 0.35, "similarity_boost": 0.90, "style": 0.80},
    "angry": {"stability": 0.90, "similarity_boost": 0.60, "style": 0.10},
    "fearful": {"stability": 0.75, "similarity_boost": 0.65, "style": 0.15},
    "fear": {"stability": 0.75, "similarity_boost": 0.65, "style": 0.15},
    "neutral": {"stability": 0.60, "similarity_boost": 0.75, "style": 0.40},
    "surprised": {"stability": 0.30, "similarity_boost": 0.85, "style": 0.90},
    "excited": {"stability": 0.35, "similarity_boost": 0.90, "style": 0.80},
    "calm": {"stability": 0.80, "similarity_boost": 0.70, "style": 0.20},
    "disgusted": {"stability": 0.70, "similarity_boost": 0.70, "style": 0.30},
}

# pyttsx3 rate by emotion (wpm)
PYTTSX3_RATES = {
    "sad": 130,
    "happy": 185,
    "angry": 145,  # Slower = calmer
    "fearful": 140,
    "fear": 140,
    "neutral": 160,
    "surprised": 175,
    "excited": 185,
    "calm": 140,
    "disgusted": 150,
}

# Simple in-memory cache for TTS results
# Key: (text, emotion), Value: audio_bytes
_tts_cache: Dict[Tuple[str, str], bytes] = {}
_cache_keys: list = []  # Track order for LRU
MAX_CACHE_SIZE = 5


def _get_voice_settings(emotion: str) -> Dict[str, float]:
    """Get ElevenLabs voice settings for emotion."""
    return ELEVENLABS_SETTINGS.get(emotion.lower(), ELEVENLABS_SETTINGS["neutral"])


def _get_cache_key(text: str, emotion: str) -> Tuple[str, str]:
    """Generate cache key for text+emotion combination."""
    return (text.strip().lower(), emotion.lower())


def _get_from_cache(text: str, emotion: str) -> Optional[bytes]:
    """Get cached TTS result if exists."""
    key = _get_cache_key(text, emotion)
    if key in _tts_cache:
        # Move to end (most recently used)
        _cache_keys.remove(key)
        _cache_keys.append(key)
        return _tts_cache[key]
    return None


def _add_to_cache(text: str, emotion: str, audio_bytes: bytes) -> None:
    """Add result to cache with LRU eviction."""
    global _tts_cache, _cache_keys

    key = _get_cache_key(text, emotion)

    # Remove if exists (will re-add at end)
    if key in _cache_keys:
        _cache_keys.remove(key)
    elif key in _tts_cache:
        del _tts_cache[key]

    # Evict oldest if at capacity
    while len(_cache_keys) >= MAX_CACHE_SIZE:
        oldest = _cache_keys.pop(0)
        if oldest in _tts_cache:
            del _tts_cache[oldest]

    # Add new entry
    _tts_cache[key] = audio_bytes
    _cache_keys.append(key)


def _clear_cache() -> None:
    """Clear the TTS cache."""
    global _tts_cache, _cache_keys
    _tts_cache.clear()
    _cache_keys.clear()


def _speak_pyttsx3(text: str, emotion: str = "neutral") -> bytes:
    """
    Fallback TTS using pyttsx3.
    Rate: 160 wpm (adjustable by emotion), Volume: 0.9
    """
    if not PYTTSX3_AVAILABLE:
        raise RuntimeError("pyttsx3 not installed")

    rate = PYTTSX3_RATES.get(emotion.lower(), 160)

    engine = pyttsx3.init()
    engine.setProperty('rate', rate)
    engine.setProperty('volume', 0.9)

    # Create temp file
    temp_file = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    temp_path = temp_file.name
    temp_file.close()

    try:
        engine.save_to_file(text, temp_path)
        engine.runAndWait()

        with open(temp_path, 'rb') as f:
            audio_data = f.read()

        return audio_data
    finally:
        try:
            Path(temp_path).unlink()
        except:
            pass


async def _speak_elevenlabs(text: str, emotion: str, api_key: str, voice_id: str) -> bytes:
    """
    Speak using ElevenLabs API.

    Args:
        text: Text to speak
        emotion: Emotion for voice settings
        api_key: ElevenLabs API key
        voice_id: ElevenLabs voice ID

    Returns:
        MP3 audio bytes
    """
    try:
        import aiohttp
    except ImportError:
        raise RuntimeError("aiohttp not installed")

    settings = _get_voice_settings(emotion)

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    headers = {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": api_key
    }
    data = {
        "text": text,
        "model_id": "eleven_monolingual_v1",
        "voice_settings": {
            "stability": settings["stability"],
            "similarity_boost": settings["similarity_boost"],
            "style": settings["style"]
        }
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=data, headers=headers, timeout=30) as response:
            if response.status == 200:
                audio_data = await response.read()
                return audio_data
            else:
                error_text = await response.text()
                raise RuntimeError(f"ElevenLabs API error {response.status}: {error_text}")


async def speak(text: str, emotion: str = "neutral") -> bytes:
    """
    Convert text to speech with emotion-based voice settings.

    Primary: ElevenLabs API with emotion-based settings
    Fallback: pyttsx3 if no API key or error

    Implements LRU cache for last 5 unique (text, emotion) combinations.

    Args:
        text: Text to speak
        emotion: Detected emotion for voice tuning

    Returns:
        Audio bytes (mp3 for ElevenLabs, wav for pyttsx3 fallback)
    """
    if not text or not text.strip():
        raise ValueError("Text cannot be empty")

    text = text.strip()

    # Check cache first
    cached = _get_from_cache(text, emotion)
    if cached:
        return cached

    api_key = os.getenv("ELEVENLABS_API_KEY")
    voice_id = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")

    # Try ElevenLabs if API key exists
    if api_key and api_key.strip():
        try:
            audio_data = await _speak_elevenlabs(text, emotion, api_key, voice_id)
            # Cache the result
            _add_to_cache(text, emotion, audio_data)
            return audio_data

        except Exception as e:
            print(f"[TTS] ElevenLabs failed: {e}, falling back to pyttsx3")

    # Fallback to pyttsx3
    if not PYTTSX3_AVAILABLE:
        raise RuntimeError("Neither ElevenLabs nor pyttsx3 available. Install pyttsx3 or set ELEVENLABS_API_KEY")

    audio_data = await asyncio.to_thread(_speak_pyttsx3, text, emotion)
    # Note: We don't cache pyttsx3 results as they're fast enough to generate
    return audio_data


async def speak_to_file(text: str, emotion: str = "neutral", output_path: str = None) -> str:
    """
    Convert text to speech and save to file.

    Args:
        text: Text to speak
        emotion: Detected emotion
        output_path: Optional output file path

    Returns:
        Path to audio file
    """
    audio_bytes = await speak(text, emotion)

    if output_path is None:
        suffix = ".mp3" if os.getenv("ELEVENLABS_API_KEY") else ".wav"
        temp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
        output_path = temp.name
        temp.close()

    with open(output_path, 'wb') as f:
        f.write(audio_bytes)

    return output_path


def get_cache_info() -> Dict[str, Any]:
    """Get cache statistics."""
    return {
        "cached_items": len(_cache_keys),
        "max_size": MAX_CACHE_SIZE,
        "keys": [(k[0][:30] + "...", k[1]) for k in _cache_keys]
    }


# =============================================================================
# Test
# =============================================================================

if __name__ == "__main__":
    async def test():
        print("=" * 60)
        print("EMPATHIX TTS Engine - Test Mode")
        print("=" * 60)

        # Show cache info
        print(f"\nCache info: {get_cache_info()}")

        test_cases = [
            ("Hello! I'm feeling great today!", "happy"),
            ("I'm having a difficult time right now.", "sad"),
            ("This is absolutely unacceptable!", "angry"),
            ("I don't know what to do...", "fearful"),
            ("The weather is quite nice today.", "neutral"),
            ("That was a complete surprise!", "surprised"),
        ]

        for text, emotion in test_cases:
            print(f"\nTesting: '{text[:40]}...' (emotion: {emotion})")

            try:
                audio = await speak(text, emotion)
                print(f"  [OK] Generated {len(audio)} bytes of audio")

                # Save test file
                suffix = ".mp3" if os.getenv("ELEVENLABS_API_KEY") else ".wav"
                test_file = f"test_tts_{emotion}{suffix}"
                with open(test_file, 'wb') as f:
                    f.write(audio)
                print(f"  [OK] Saved to {test_file}")

            except Exception as e:
                print(f"  [FAIL] Error: {e}")

        # Test caching - second request should be instant
        print("\n--- Testing cache (same text should be instant) ---")
        cached_text = "This is a test for caching."
        cached_emotion = "happy"

        import time

        # First call
        start = time.time()
        audio1 = await speak(cached_text, cached_emotion)
        duration1 = time.time() - start
        print(f"First call: {duration1:.3f}s, {len(audio1)} bytes")

        # Second call (cached)
        start = time.time()
        audio2 = await speak(cached_text, cached_emotion)
        duration2 = time.time() - start
        print(f"Second call: {duration2:.3f}s, {len(audio2)} bytes (cached)")

        print(f"\nCache info after test: {get_cache_info()}")

        print(f"\n{'=' * 60}")
        print("Test complete!")

    asyncio.run(test())
