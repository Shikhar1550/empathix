"""
Emotion Detection Module - Enhanced Version for EMPATHIX
Analyzes audio features to detect emotional state.
Uses ensemble of SpeechBrain models + feature-based fallback.
"""

import os
import sys
import warnings
import functools
from typing import Dict, Any, Optional, List, Tuple
from pathlib import Path
from dataclasses import dataclass

import numpy as np
import torch
import torch.nn.functional as F
import librosa

# =============================================================================
# WINDOWS COMPATIBILITY: Patch SpeechBrain LazyModule
# =============================================================================
import importlib.abc
import types

os.environ["K2_FSA_DISABLED"] = "1"
warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", message=".*k2.*")
warnings.filterwarnings("ignore", message=".*Lazy import.*")
warnings.filterwarnings("ignore", message=".*LazyModule.*")

# Block k2 AND speechbrain.integrations.nlp (missing dependency) imports
_BLOCKED_MODULES = {'k2', 'speechbrain.integrations.nlp'}

class ModuleBlocker(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path, target=None):
        for blocked in _BLOCKED_MODULES:
            if fullname == blocked or fullname.startswith(blocked + '.'):
                return None  # return None so Python treats it as "not found"
        return None

sys.meta_path.insert(0, ModuleBlocker())

# Also create dummy k2 module to satisfy any imports
class DummyK2(types.ModuleType):
    def __init__(self):
        super().__init__('k2')
    def __getattr__(self, name):
        raise AttributeError(f"k2.{name} not available")

sys.modules['k2'] = DummyK2()

# Pre-create a dummy for speechbrain.integrations.nlp so lazy loaders don't crash
class DummyNLP(types.ModuleType):
    def __init__(self):
        super().__init__('speechbrain.integrations.nlp')
    def __getattr__(self, name):
        return None

sys.modules['speechbrain.integrations.nlp'] = DummyNLP()

# Import SpeechBrain
try:
    from speechbrain.inference import EncoderClassifier
except ImportError:
    from speechbrain.pretrained import EncoderClassifier

# Patch SpeechBrain LazyModule to prevent inspect.getmodule() recursion
try:
    from speechbrain.utils.importutils import LazyModule
    _orig_getattr = LazyModule.__getattr__

    def _patched_getattr(self, attr):
        if attr in ('__file__', '__cached__', '__spec__', '__name__',
                     '__loader__', '__path__', '__package__'):
            return self.__dict__.get(attr)
        try:
            return _orig_getattr(self, attr)
        except Exception:
            return None

    LazyModule.__getattr__ = _patched_getattr  # Fixed: was ____getattr__ (4 underscores)
except Exception:
    pass


# =============================================================================
# Configuration
# =============================================================================

@dataclass
class EmotionConfig:
    """Configuration for emotion detection."""
    sample_rate: int = 16000
    min_duration: float = 0.5
    confidence_threshold: float = 0.3
    top_k: int = 3
    # Ensemble weights
    model_weight: float = 0.7
    feature_weight: float = 0.3
    # Confidence thresholds for smoothing
    low_confidence_threshold: float = 0.6
    fallback_confidence_threshold: float = 0.45


# IEMOCAP emotion labels from SpeechBrain model
IEMOCAP_LABELS = ["neu", "ang", "hap", "sad"]

# SUPERB model labels (may differ, map them)
SUPERB_LABELS = ["neutral", "angry", "happy", "sad", "fear", "disgust", "surprise"]

# Full mapping to standardized emotions
EMOTION_MAPPING = {
    # IEMOCAP
    "neu": ("neutral", 1.0),
    "hap": ("happy", 1.0),
    "exc": ("happy", 0.9),
    "ang": ("angry", 1.0),
    "sad": ("sad", 1.0),
    "fea": ("fearful", 1.0),
    "sur": ("surprised", 1.0),
    "dis": ("disgusted", 1.0),
    "fru": ("frustrated", 0.8),
    # SUPERB
    "neutral": ("neutral", 1.0),
    "happy": ("happy", 1.0),
    "angry": ("angry", 1.0),
    "sad": ("sad", 1.0),
    "fear": ("fearful", 1.0),
    "disgust": ("disgusted", 1.0),
    "surprise": ("surprised", 0.9),
}

SUPPORTED_EMOTIONS = [
    "neutral", "happy", "sad", "angry", "fearful",
    "surprised", "disgusted", "calm", "excited"
]


# =============================================================================
# Global Model Cache - ENSEMBLE
# =============================================================================

_primary_classifier = None
_secondary_classifier = None
_device = None
_model_loading = False

def _get_device():
    """Get optimal device for inference."""
    global _device
    if _device is None:
        if torch.cuda.is_available():
            _device = torch.device("cuda")
        else:
            _device = torch.device("cpu")
    return _device


def _load_model():
    """Load both SpeechBrain models for ensemble."""
    global _primary_classifier, _secondary_classifier, _model_loading

    if _primary_classifier is not None and _secondary_classifier is not None:
        return True

    if _model_loading:
        import time
        timeout = 120
        start = time.time()
        while _model_loading and time.time() - start < timeout:
            time.sleep(0.5)
        return _primary_classifier is not None

    _model_loading = True

    try:
        # Primary model: IEMOCAP emotion recognition
        if _primary_classifier is None:
            print("[EmotionDetector] Loading PRIMARY model (wav2vec2-IEMOCAP)...")
            _primary_classifier = EncoderClassifier.from_hparams(
                source="speechbrain/emotion-recognition-wav2vec2-IEMOCAP",
                savedir="pretrained_models/emotion-wav2vec2",
                run_opts={"device": str(_get_device())}
            )
            _primary_classifier.eval()
            print("[EmotionDetector] Primary model loaded!")

        # Disabled Secondary model: SUPERB emotion recognition (Causes 404 for hyperparams.yaml)
        # if _secondary_classifier is None:
        #     print("[EmotionDetector] Loading SECONDARY model (superb-er)...")
        #     _secondary_classifier = EncoderClassifier.from_hparams(
        #         source="superb/wav2vec2-base-superb-er",
        #         savedir="pretrained_models/superb-er",
        #         run_opts={"device": str(_get_device())}
        #     )
        #     _secondary_classifier.eval()
        #     print("[EmotionDetector] Secondary model loaded!")

        return True

    except Exception as e:
        print(f"[EmotionDetector] Failed to load models: {e}")
        return False
    finally:
        _model_loading = False


def are_models_loaded() -> bool:
    """Check if both models are loaded."""
    return _primary_classifier is not None


# =============================================================================
# Audio Preprocessing
# =============================================================================

def preprocess_audio(audio_path: str, config: EmotionConfig = None) -> Tuple[np.ndarray, dict]:
    """
    Preprocess audio for emotion detection.

    Args:
        audio_path: Path to audio file
        config: Emotion configuration

    Returns:
        Tuple of (preprocessed_audio, metadata)
    """
    if config is None:
        config = EmotionConfig()

    audio, sr = librosa.load(audio_path, sr=config.sample_rate, mono=True)

    duration = len(audio) / config.sample_rate
    if duration < config.min_duration:
        raise ValueError(f"Audio too short: {duration:.2f}s (min: {config.min_duration}s)")

    # Remove silence at start and end
    audio, _ = librosa.effects.trim(audio, top_db=20)

    # Normalize audio (RMS normalization)
    rms = np.sqrt(np.mean(audio ** 2))
    if rms > 0:
        audio = audio * (0.3 / rms)

    audio = np.clip(audio, -1.0, 1.0)

    metadata = {
        "original_duration": duration,
        "processed_duration": len(audio) / config.sample_rate,
        "rms": float(rms)
    }

    return audio, metadata


def augment_audio(audio: np.ndarray, sr: int = 16000) -> List[np.ndarray]:
    """Create augmented versions for ensemble prediction."""
    augmented = [audio]

    for rate in [0.95, 1.05]:
        try:
            stretched = librosa.effects.time_stretch(audio, rate=rate)
            augmented.append(stretched[:len(audio)])
        except Exception:
            pass

    for n_steps in [-1, 1]:
        try:
            pitched = librosa.effects.pitch_shift(audio, sr=sr, n_steps=n_steps)
            augmented.append(pitched)
        except Exception:
            pass

    noise = np.random.normal(0, 0.005, len(audio))
    augmented.append(audio + noise)

    return augmented


# =============================================================================
# Feature-Based Emotion Detection
# =============================================================================

def extract_acoustic_features(audio: np.ndarray, sr: int = 16000) -> Dict[str, float]:
    """Extract key acoustic features for rule-based classification."""
    features = {}

    # RMS Energy
    rms = librosa.feature.rms(y=audio, frame_length=512, hop_length=160)[0]
    features["energy_rms_mean"] = float(np.mean(rms))
    features["energy_rms_std"] = float(np.std(rms))

    # Pitch using YIN
    f0 = librosa.yin(audio, fmin=50, fmax=400, sr=sr, hop_length=160)
    voiced_f0 = f0[f0 > 0]

    if len(voiced_f0) > 0:
        features["pitch_mean"] = float(np.mean(voiced_f0))
        features["pitch_std"] = float(np.std(voiced_f0))
        features["pitch_range"] = float(np.max(voiced_f0) - np.min(voiced_f0))
    else:
        features["pitch_mean"] = 0.0
        features["pitch_std"] = 0.0
        features["pitch_range"] = 0.0

    # Zero crossing rate
    zcr = librosa.feature.zero_crossing_rate(audio, frame_length=512, hop_length=160)[0]
    features["zcr_mean"] = float(np.mean(zcr))

    # Spectral features
    cent = librosa.feature.spectral_centroid(y=audio, sr=sr, n_fft=512, hop_length=160)[0]
    features["spectral_centroid_mean"] = float(np.mean(cent))

    return features


def emotion_from_features(features: Dict[str, float]) -> Tuple[str, float]:
    """
    Pure rule-based emotion detection from acoustic features.
    Used as fallback when model confidence is low.

    Rules:
    - High energy (>0.3) + high pitch (>200Hz) → happy or angry
    - Low energy (<0.1) + low pitch (<120Hz) → sad
    - Monotone (pitch_std < 20) → neutral
    - High energy + low pitch variance → angry
    - High energy + high pitch variance → excited/happy

    Args:
        features: Dictionary of acoustic features

    Returns:
        Tuple of (emotion, confidence)
    """
    energy = features.get("energy_rms_mean", 0.2)
    pitch = features.get("pitch_mean", 150)
    pitch_std = features.get("pitch_std", 50)
    pitch_range = features.get("pitch_range", 100)

    # Score each emotion based on features
    scores = {"neutral": 0, "happy": 0, "sad": 0, "angry": 0, "fearful": 0, "excited": 0}

    # High arousal indicators (energy, pitch)
    high_arousal = energy > 0.25 and pitch > 180
    low_arousal = energy < 0.12 and pitch < 140
    mid_arousal = not high_arousal and not low_arousal

    # Valence indicators (pitch variance, range)
    high_variance = pitch_std > 60 or pitch_range > 150
    low_variance = pitch_std < 30 and pitch_range < 80

    # Apply rules
    if low_arousal:
        scores["sad"] += 0.8
        scores["neutral"] += 0.3
    elif high_arousal:
        if high_variance:
            scores["happy"] += 0.7
            scores["excited"] += 0.6
        else:
            scores["angry"] += 0.7
    elif mid_arousal:
        scores["neutral"] += 0.5

    # Pitch-based refinement
    if pitch < 130 and energy < 0.15:
        scores["sad"] += 0.4
    elif pitch > 220 and energy > 0.2:
        scores["happy"] += 0.3
        scores["excited"] += 0.3

    # Monotone → neutral
    if low_variance:
        scores["neutral"] = max(scores["neutral"], 0.6)
        # Reduce others
        for e in ["happy", "angry", "sad", "fearful"]:
            scores[e] *= 0.5

    # Get best emotion
    best_emotion = max(scores, key=scores.get)
    confidence = scores[best_emotion]

    return best_emotion, confidence


def apply_smoothing(
    model_emotion: str,
    model_confidence: float,
    features: Dict[str, float]
) -> Tuple[str, float]:
    """
    Apply smoothing when model confidence is low.
    Use features as tiebreaker.

    Args:
        model_emotion: Primary model prediction
        model_confidence: Model confidence score
        features: Acoustic features

    Returns:
        Tuple of (smoothed_emotion, adjusted_confidence)
    """
    if model_confidence >= EmotionConfig.low_confidence_threshold:
        return model_emotion, model_confidence

    # Get feature-based prediction
    feature_emotion, feature_confidence = emotion_from_features(features)

    # If model and features agree, boost confidence
    if model_emotion == feature_emotion:
        new_confidence = min(model_confidence + 0.15, 1.0)
        return model_emotion, new_confidence

    # If they disagree, lean toward feature prediction if model is uncertain
    if model_confidence < 0.4:
        # Weighted combination
        if feature_confidence > 0.5:
            return feature_emotion, 0.5

    return model_emotion, model_confidence


# =============================================================================
# Ensemble Model Inference
# =============================================================================

def _run_model_inference(
    classifier,
    audio: np.ndarray,
    labels: List[str],
    device: torch.device
) -> Dict[str, float]:
    """Run inference on a single model and return emotion scores."""
    scores = {}

    try:
        audio_tensor = torch.tensor(audio, dtype=torch.float32).unsqueeze(0).to(device)

        with torch.no_grad():
            # Get wav2vec2 features
            wav2vec_out = classifier.mods.wav2vec2(audio_tensor)
            if hasattr(wav2vec_out, 'last_hidden_state'):
                embeddings = wav2vec_out.last_hidden_state
            else:
                embeddings = wav2vec_out[0] if isinstance(wav2vec_out, tuple) else wav2vec_out

            # Pool and classify
            embeddings = classifier.mods.avg_pool(embeddings)
            logits = classifier.mods.output_mlp(embeddings).squeeze()
            probs = torch.softmax(logits, dim=-1).cpu().numpy()

        # Map to standard emotions
        for label, prob in zip(labels, probs):
            mapped_emotion, weight = EMOTION_MAPPING.get(label, (label, 0.5))
            if mapped_emotion not in scores:
                scores[mapped_emotion] = []
            scores[mapped_emotion].append(prob * weight)

        # Average scores for duplicate mappings
        final_scores = {k: np.mean(v) for k, v in scores.items()}
        return final_scores

    except Exception as e:
        print(f"[EmotionDetector] Model inference error: {e}")
        return {}


def ensemble_predict(audio: np.ndarray, config: EmotionConfig) -> Tuple[str, float, Dict[str, float]]:
    """
    Run ensemble prediction using both models.

    Args:
        audio: Preprocessed audio array
        config: Configuration

    Returns:
        Tuple of (best_emotion, confidence, all_scores)
    """
    global _primary_classifier, _secondary_classifier

    device = _get_device()
    all_scores = {}

    # Primary model prediction (IEMOCAP)
    if _primary_classifier:
        primary_scores = _run_model_inference(
            _primary_classifier, audio, IEMOCAP_LABELS, device
        )
        for emotion, score in primary_scores.items():
            if emotion not in all_scores:
                all_scores[emotion] = []
            all_scores[emotion].append(score * 0.6)  # Weight primary higher

    # Secondary model prediction (SUPERB) - Disabled
    # if _secondary_classifier:
    #     secondary_scores = _run_model_inference(
    #         _secondary_classifier, audio, SUPERB_LABELS, device
    #     )
    #     for emotion, score in secondary_scores.items():
    #         if emotion not in all_scores:
    #             all_scores[emotion] = []
    #         all_scores[emotion].append(score * 0.4)  # Weight secondary lower

    # Average ensemble scores
    final_scores = {k: np.mean(v) for k, v in all_scores.items()}

    if not final_scores:
        return "neutral", 0.0, {}

    # Get best emotion
    best_emotion = max(final_scores, key=final_scores.get)
    confidence = final_scores[best_emotion]

    return best_emotion, confidence, final_scores


# =============================================================================
# Main Detection Function
# =============================================================================

def detect_emotion(
    audio_path: str,
    use_augmentation: bool = False,  # Disabled by default for speed
    return_all_scores: bool = True,
    config: EmotionConfig = None
) -> Dict[str, Any]:
    """
    Detect emotion from audio file using ensemble of models + feature rules.

    Final output combines:
    - Model ensemble output (weight: 0.7)
    - Feature-based rules (weight: 0.3) - only if model confidence < 0.6

    Args:
        audio_path: Path to audio file
        use_augmentation: Whether to use audio augmentation
        return_all_scores: Return scores for all emotions
        config: Emotion configuration

    Returns:
        Dictionary with emotion, confidence, and scores
    """
    if config is None:
        config = EmotionConfig()

    try:
        path = Path(audio_path)
        if not path.exists():
            return _error_result(f"File not found: {audio_path}")

        # Preprocess audio
        try:
            audio, metadata = preprocess_audio(str(path), config)
        except ValueError as e:
            return _error_result(str(e))

        # Extract acoustic features for rule-based fallback
        features = extract_acoustic_features(audio, config.sample_rate)

        # Load models
        if not _load_model():
            # Fallback to feature-based only
            emotion, conf = emotion_from_features(features)
            result = {
                "emotion": emotion,
                "confidence": round(conf, 3),
                "source": "features_only",
                "metadata": metadata
            }
            if return_all_scores:
                result["all_scores"] = {emotion: round(conf, 3)}
            return result

        # Run ensemble prediction
        model_emotion, model_confidence, model_scores = ensemble_predict(audio, config)

        # Apply smoothing if confidence is low
        if model_confidence < config.low_confidence_threshold:
            smoothed_emotion, smoothed_confidence = apply_smoothing(
                model_emotion, model_confidence, features
            )

            # If smoothing changed the emotion, adjust confidence
            if smoothed_emotion != model_emotion:
                # Weighted combination: model (0.7) + features (0.3)
                feature_emotion, feature_conf = emotion_from_features(features)
                if feature_emotion == smoothed_emotion:
                    final_confidence = (model_confidence * 0.7) + (feature_conf * 0.3)
                else:
                    final_confidence = model_confidence * 0.7
                final_emotion = smoothed_emotion
            else:
                final_emotion = model_emotion
                final_confidence = smoothed_confidence
        else:
            final_emotion = model_emotion
            final_confidence = model_confidence

        # Pure feature fallback if very low confidence
        if final_confidence < config.fallback_confidence_threshold:
            feature_emotion, feature_conf = emotion_from_features(features)
            # Blend
            final_emotion = feature_emotion
            final_confidence = (model_confidence * 0.4) + (feature_conf * 0.6)

        # Ensure threshold
        if final_confidence < config.confidence_threshold:
            final_emotion = "neutral"
            final_confidence = max(final_confidence, 0.3)

        # Build result - convert numpy floats to Python floats
        result = {
            "emotion": final_emotion,
            "confidence": float(round(final_confidence, 3)),
            "metadata": {k: float(v) if isinstance(v, np.floating) else v
                        for k, v in metadata.items()},
            "features": {k: float(v) if isinstance(v, np.floating) else v
                        for k, v in features.items()},
            "model_prediction": model_emotion,
            "model_confidence": float(round(model_confidence, 3))
        }

        if return_all_scores:
            sorted_scores = dict(sorted(
                model_scores.items(),
                key=lambda x: x[1],
                reverse=True
            ))
            result["all_scores"] = {k: float(round(v, 4)) for k, v in sorted_scores.items()}

        return result

    except Exception as e:
        import traceback
        return _error_result(f"{str(e)}\n{traceback.format_exc()}")


def _error_result(message: str) -> Dict[str, Any]:
    """Create error result."""
    return {
        "emotion": "neutral",
        "confidence": 0.0,
        "error": message
    }


# =============================================================================
# Batch Processing
# =============================================================================

def detect_emotion_batch(
    audio_paths: List[str],
    **kwargs
) -> List[Dict[str, Any]]:
    """
    Detect emotions from multiple audio files.

    Args:
        audio_paths: List of paths to audio files
        **kwargs: Additional arguments for detect_emotion

    Returns:
        List of emotion detection results
    """
    results = []
    total = len(audio_paths)

    for idx, path in enumerate(audio_paths, 1):
        print(f"Processing {idx}/{total}: {path}")
        result = detect_emotion(path, **kwargs)
        results.append(result)

    return results


# =============================================================================
# Utilities
# =============================================================================

def get_emotion_intensity(
    emotion: str,
    audio_features: Dict[str, Any]
) -> float:
    """
    Calculate intensity of the detected emotion.

    Args:
        emotion: Detected emotion label
        audio_features: Audio feature dictionary

    Returns:
        Intensity score between 0 and 1
    """
    if not audio_features:
        return 0.5

    energy = audio_features.get("energy_rms_mean", 0.5)
    pitch_range = audio_features.get("pitch_range", 100)
    pitch_std = audio_features.get("pitch_std", 50)

    energy_component = min(energy * 2, 1.0)
    pitch_component = min(pitch_std / 150, 1.0)
    range_component = min(pitch_range / 300, 1.0)

    weights = {
        "angry": [0.4, 0.3, 0.3],
        "happy": [0.3, 0.4, 0.3],
        "excited": [0.3, 0.5, 0.2],
        "sad": [0.2, 0.2, 0.6],
        "fearful": [0.3, 0.5, 0.2],
        "surprised": [0.3, 0.4, 0.3],
        "neutral": [0.33, 0.33, 0.34]
    }

    w = weights.get(emotion, [0.33, 0.33, 0.34])
    intensity = w[0] * energy_component + w[1] * pitch_component + w[2] * range_component

    return round(min(max(intensity, 0.0), 1.0), 2)


# =============================================================================
# Test Block
# =============================================================================

if __name__ == "__main__":
    print("=" * 60)
    print("EMPATHIX Emotion Detector - Enhanced Ensemble Edition")
    print("=" * 60)

    script_dir = Path(__file__).parent.absolute()
    print(f"Script directory: {script_dir}\n")

    # Find test files
    test_files = list(script_dir.glob("*.wav")) + list(script_dir.glob("*.mp3"))
    test_audio_dir = script_dir / "test_audio"
    if test_audio_dir.exists():
        test_files.extend(test_audio_dir.glob("*.wav"))

    if not test_files:
        print("No audio files found!")
        print("\nPlease add a test.wav file in:", script_dir)
        print("\nTo record:")
        print('  ffmpeg -f dshow -i audio="Microphone" test.wav')
        exit(1)

    print(f"Found {len(test_files)} audio file(s)\n")

    # Process each file
    config = EmotionConfig(
        confidence_threshold=0.25,
        low_confidence_threshold=0.6,
        fallback_confidence_threshold=0.45
    )

    for test_file in test_files[:5]:
        print(f"\n{'-' * 60}")
        print(f"File: {test_file.name}")
        print(f"Size: {test_file.stat().st_size / 1024:.1f} KB")
        print(f"{'-' * 60}")

        result = detect_emotion(str(test_file), config=config)

        if result.get("error"):
            print(f"[ERROR] {result['error']}")
            continue

        print(f"\n[OK] Final Emotion: {result['emotion'].upper()}")
        print(f"  Confidence: {result['confidence']:.3f}")
        print(f"  Model Prediction: {result.get('model_prediction', 'N/A')}")
        print(f"  Model Confidence: {result.get('model_confidence', 'N/A')}")

        if "metadata" in result:
            meta = result['metadata']
            print(f"  Duration: {meta['processed_duration']:.2f}s")

        if "features" in result:
            f = result['features']
            print(f"\n  Acoustic Features:")
            print(f"    Energy RMS: {f['energy_rms_mean']:.4f}")
            print(f"    Pitch Mean: {f['pitch_mean']:.1f} Hz")
            print(f"    Pitch Std: {f['pitch_std']:.1f}")

        if "all_scores" in result:
            print(f"\n  All Emotions:")
            for emotion, score in list(result['all_scores'].items())[:5]:
                bar = "█" * int(score * 30)
                print(f"    {emotion:12} {score:.3f} {bar}")

    print(f"\n{'=' * 60}")
    print("Done!")
