"""
EMPATHIX Emotion Detection Test Suite
Records 5 audio clips with different emotional tones and tests detection accuracy.
"""

import os
import sys
import time
import wave
from pathlib import Path
from typing import List, Dict, Tuple

# Test configuration
TEST_CLIPS = [
    ("sad", "Say 'I am feeling sad today' in a SAD tone"),
    ("happy", "Say 'I am feeling great today' in a HAPPY tone"),
    ("angry", "Say 'I am so frustrated' in an ANGRY tone"),
    ("fear", "Say 'I am really scared' in a FEARFUL tone"),
    ("neutral", "Say 'It is a regular day' in a NEUTRAL tone"),
]

RECORD_SECONDS = 3
SAMPLE_RATE = 16000
CHANNELS = 1
CHUNK_SIZE = 1024
TEST_AUDIO_DIR = Path("test_audio")


def countdown(prompt: str, seconds: int = 3) -> None:
    """Show countdown before recording."""
    print(f"\n{'='*50}")
    print(f"🎤 {prompt}")
    print(f"{'='*50}")
    for i in range(seconds, 0, -1):
        print(f"   Recording in {i}...", end="\r")
        time.sleep(1)
    print(f"   🎙️  RECORDING NOW! Speak now...        ")


def record_audio(filename: str, duration: int = RECORD_SECONDS) -> bool:
    """
    Record audio from microphone and save to file.

    Args:
        filename: Output WAV filename
        duration: Recording duration in seconds

    Returns:
        True if recording successful, False otherwise
    """
    try:
        import pyaudio
    except ImportError:
        print("\n❌ ERROR: PyAudio not installed!")
        print("   Install with: pip install pyaudio")
        print("\n   Windows users may also need:")
        print("   pip install pipwin")
        print("   pipwin install pyaudio")
        return False

    # Ensure test directory exists
    TEST_AUDIO_DIR.mkdir(exist_ok=True)
    filepath = TEST_AUDIO_DIR / filename

    # Initialize PyAudio
    audio = pyaudio.PyAudio()

    # Find working input device
    device_index = None
    for i in range(audio.get_device_count()):
        info = audio.get_device_info_by_index(i)
        if info.get('maxInputChannels', 0) > 0:
            device_index = i
            break

    try:
        # Open stream
        stream = audio.open(
            format=pyaudio.paInt16,
            channels=CHANNELS,
            rate=SAMPLE_RATE,
            input=True,
            input_device_index=device_index,
            frames_per_buffer=CHUNK_SIZE
        )

        # Record audio
        frames = []
        for _ in range(0, int(SAMPLE_RATE / CHUNK_SIZE * duration)):
            data = stream.read(CHUNK_SIZE, exception_on_overflow=False)
            frames.append(data)

        # Stop and close stream
        stream.stop_stream()
        stream.close()
        audio.terminate()

        # Save to WAV file
        with wave.open(str(filepath), 'wb') as wf:
            wf.setnchannels(CHANNELS)
            wf.setsampwidth(audio.get_sample_size(pyaudio.paInt16))
            wf.setframerate(SAMPLE_RATE)
            wf.writeframes(b''.join(frames))

        print(f"   ✅ Saved: {filepath.name}")
        return True

    except Exception as e:
        print(f"   ❌ Recording failed: {e}")
        try:
            audio.terminate()
        except:
            pass
        return False


def run_emotion_detection(filepath: Path) -> Dict:
    """
    Run emotion detection on audio file.

    Args:
        filepath: Path to audio file

    Returns:
        Emotion detection result dictionary
    """
    try:
        from emotion_detector import detect_emotion, EmotionConfig

        config = EmotionConfig(confidence_threshold=0.25)
        result = detect_emotion(str(filepath), config=config)
        return result
    except Exception as e:
        return {
            "emotion": "error",
            "confidence": 0.0,
            "error": str(e)
        }


def print_results_table(results: List[Tuple[str, str, float, bool]]) -> None:
    """
    Print formatted results table.

    Args:
        results: List of (expected, detected, confidence, passed) tuples
    """
    print("\n" + "="*70)
    print("📊 EMOTION DETECTION TEST RESULTS")
    print("="*70)
    print(f"{'Expected':<12} | {'Detected':<12} | {'Confidence':>10} | {'Status':<8}")
    print("-"*70)

    for expected, detected, confidence, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{expected:<12} | {detected:<12} | {confidence:>10.3f} | {status:<8}")

    print("="*70)


def calculate_accuracy(results: List[Tuple[str, str, float, bool]]) -> float:
    """Calculate accuracy percentage."""
    if not results:
        return 0.0
    passed_count = sum(1 for _, _, _, passed in results if passed)
    return (passed_count / len(results)) * 100


def is_correct_detection(expected: str, detected: str) -> bool:
    """
    Check if detected emotion matches expected.
    Handles emotion aliases (e.g., 'excited' matches 'happy').
    """
    expected_lower = expected.lower()
    detected_lower = detected.lower()

    if expected_lower == detected_lower:
        return True

    # Aliases - some emotions map to similar categories
    aliases = {
        "happy": ["happy", "excited"],
        "excited": ["happy", "excited"],
        "fear": ["fearful", "fear"],
        "fearful": ["fearful", "fear"],
    }

    if expected_lower in aliases:
        return detected_lower in aliases[expected_lower]

    return False


def main():
    """Main test runner."""
    print("="*70)
    print("🧪 EMPATHIX EMOTION DETECTION TEST SUITE")
    print("="*70)
    print("\nThis test will record 5 audio clips with different emotional tones.")
    print("Please speak clearly into your microphone when prompted.")
    print(f"\nEach clip will be {RECORD_SECONDS} seconds long.")
    print("\nPress ENTER to start...")
    input()

    # Check emotion_detector is available
    try:
        import emotion_detector
        print("✅ Emotion detector module loaded\n")
    except ImportError as e:
        print(f"❌ ERROR: Cannot import emotion_detector: {e}")
        print("   Make sure you're running from the backend directory.")
        sys.exit(1)

    # Run tests
    results = []
    test_files = []

    for emotion_name, prompt in TEST_CLIPS:
        # Record
        filename = f"test_{emotion_name}.wav"
        countdown(prompt)
        success = record_audio(filename, RECORD_SECONDS)

        if not success:
            print(f"   Skipping {emotion_name} due to recording error")
            results.append((emotion_name, "error", 0.0, False))
            continue

        # Detect emotion
        filepath = TEST_AUDIO_DIR / filename
        test_files.append(filepath)
        print(f"   🔍 Analyzing emotion...")

        result = run_emotion_detection(filepath)
        detected = result.get("emotion", "error")
        confidence = result.get("confidence", 0.0)

        if "error" in result:
            print(f"   ⚠️  Detection error: {result['error']}")
            detected = "error"

        # Check if correct
        passed = is_correct_detection(emotion_name, detected)
        results.append((emotion_name, detected, confidence, passed))

        time.sleep(0.5)  # Brief pause between recordings

    # Print results
    print_results_table(results)

    # Calculate and display accuracy
    accuracy = calculate_accuracy(results)
    print(f"\n📈 OVERALL ACCURACY: {accuracy:.1f}% ({sum(1 for r in results if r[3])}/{len(results)} correct)")

    # Summary
    if accuracy >= 80:
        print("🎉 Excellent! Emotion detection is working well!")
    elif accuracy >= 60:
        print("⚠️  Good, but could use some tuning.")
    else:
        print("💡 Try speaking more clearly or check microphone quality.")

    # Show saved files
    print(f"\n💾 Test audio files saved to: {TEST_AUDIO_DIR.absolute()}")
    print("   Files:")
    for f in test_files:
        if f.exists():
            size_kb = f.stat().st_size / 1024
            print(f"     - {f.name} ({size_kb:.1f} KB)")

    print("\n" + "="*70)
    print("Test complete!")
    print("="*70)

    return accuracy


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️  Test interrupted by user.")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
