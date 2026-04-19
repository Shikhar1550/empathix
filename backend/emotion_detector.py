"""
Text-first emotion detection for EMPATHIX.

Priority:
1. Transcript keyword/pattern/sentiment detection
2. SpeechBrain audio fallback when text is weak or missing
3. Blended text+audio result when text has some signal but not enough to stand alone
"""

from __future__ import annotations

import importlib.abc
import os
import re
import sys
import types
import warnings
from pathlib import Path
from typing import Any, Dict

import numpy as np
import torch
import librosa

from textblob import TextBlob
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

# =============================================================================
# SpeechBrain compatibility / lazy import guards
# =============================================================================

os.environ["K2_FSA_DISABLED"] = "1"
warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", message=".*k2.*")
warnings.filterwarnings("ignore", message=".*Lazy import.*")
warnings.filterwarnings("ignore", message=".*LazyModule.*")

_BLOCKED_MODULES = {"k2", "speechbrain.integrations.nlp"}


class ModuleBlocker(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path, target=None):
        for blocked in _BLOCKED_MODULES:
            if fullname == blocked or fullname.startswith(blocked + "."):
                return None
        return None


sys.meta_path.insert(0, ModuleBlocker())


class DummyK2(types.ModuleType):
    def __init__(self):
        super().__init__("k2")

    def __getattr__(self, name):
        raise AttributeError(f"k2.{name} not available")


class DummyNLP(types.ModuleType):
    def __init__(self):
        super().__init__("speechbrain.integrations.nlp")

    def __getattr__(self, name):
        return None


sys.modules["k2"] = DummyK2()
sys.modules["speechbrain.integrations.nlp"] = DummyNLP()

try:
    from speechbrain.inference import EncoderClassifier
except ImportError:
    from speechbrain.pretrained import EncoderClassifier

try:
    from speechbrain.utils.importutils import LazyModule

    _orig_getattr = LazyModule.__getattr__

    def _patched_getattr(self, attr):
        if attr in {"__file__", "__cached__", "__spec__", "__name__", "__loader__", "__path__", "__package__"}:
            return self.__dict__.get(attr)
        try:
            return _orig_getattr(self, attr)
        except Exception:
            return None

    LazyModule.__getattr__ = _patched_getattr
except Exception:
    pass


# =============================================================================
# Constants
# =============================================================================

EMOTION_KEYWORDS = {
    "angry": [
        "angry", "anger", "furious", "rage", "pissed", "mad",
        "hate", "fuck", "bitch", "damn", "frustrated", "irritated",
        "annoyed", "fed up", "sick of", "disgusted", "outraged",
        "livid", "fuming", "enraged", "screw", "stupid", "idiot",
        "terrible", "horrible", "awful", "worst",
    ],
    "sad": [
        "sad", "sadness", "cry", "crying", "tears", "upset",
        "depressed", "depression", "miserable", "unhappy", "hurt",
        "pain", "heartbroken", "lonely", "alone", "miss", "lost",
        "hopeless", "worthless", "useless", "failure", "low",
        "down", "gloomy", "devastated", "grief", "mourn",
        "tired of everything", "help me", "cant take", "giving up",
    ],
    "happy": [
        "happy", "happiness", "joy", "excited", "amazing", "great",
        "wonderful", "fantastic", "awesome", "love", "loving",
        "blessed", "grateful", "thrilled", "delighted", "ecstatic",
        "cheerful", "good mood", "feeling good", "on top",
    ],
    "fear": [
        "scared", "afraid", "fear", "fearful", "terrified", "terror",
        "anxious", "anxiety", "panic", "panicking", "worried",
        "nervous", "stress", "stressed", "overwhelmed", "helpless",
        "dread", "nightmare", "phobia", "shaking", "trembling",
    ],
    "neutral": [
        "okay", "fine", "alright", "normal", "whatever",
        "nothing", "just", "usual", "regular", "average",
    ],
}

STRONG_PATTERNS = {
    "angry": ["fuck", "bitch", "i hate", "so angry", "pissed off", "makes me mad", "so frustrated"],
    "sad": ["so sad", "feeling sad", "i'm sad", "im sad", "feeling low", "help me", "i'm crying", "im crying", "feeling down", "so low"],
    "fear": ["so scared", "i'm afraid", "im afraid", "help me i", "panic"],
    "happy": ["so happy", "feeling amazing", "great mood", "so excited", "feeling good"],
}

NEUTRAL_COMMAND_PATTERNS = [
    "what time",
    "what is the time",
    "what's the time",
    "what time is it",
    "open ",
    "play ",
    "pause ",
    "stop ",
    "search ",
    "take screenshot",
    "turn on",
    "turn off",
    "can you",
    "could you",
    "please",
]

MODEL_LABELS = ["neutral", "angry", "happy", "sad"]
RESULT_EMOTIONS = ["sad", "happy", "angry", "fear", "neutral"]

_classifier = None
_device = None
_model_loading = False
_vader = SentimentIntensityAnalyzer()


# =============================================================================
# Model loading
# =============================================================================

def _get_device():
    global _device
    if _device is None:
        _device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    return _device


def _load_model() -> bool:
    """Load the SpeechBrain audio model for fallback/blending."""
    global _classifier, _model_loading

    if _classifier is not None:
        return True

    if _model_loading:
        import time

        start = time.time()
        while _model_loading and time.time() - start < 120:
            time.sleep(0.25)
        return _classifier is not None

    _model_loading = True
    try:
        print("[EmotionDetector] Loading SpeechBrain fallback model...")
        _classifier = EncoderClassifier.from_hparams(
            source="speechbrain/emotion-recognition-wav2vec2-IEMOCAP",
            savedir="pretrained_models/emotion-wav2vec2",
            run_opts={"device": str(_get_device())},
        )
        _classifier.eval()
        print("[EmotionDetector] SpeechBrain fallback model loaded.")
        return True
    except Exception as exc:
        print(f"[EmotionDetector] Failed to load SpeechBrain model: {exc}")
        _classifier = None
        return False
    finally:
        _model_loading = False


def are_models_loaded() -> bool:
    return _classifier is not None


# =============================================================================
# Text-first emotion detection
# =============================================================================

def detect_from_text(transcript: str) -> Dict[str, Any]:
    text = (transcript or "").lower().strip()
    scores = {emotion: 0.0 for emotion in EMOTION_KEYWORDS}

    if not text:
        return {"emotion": "neutral", "confidence": 0.55, "source": "fallback", "all_scores": scores}

    for emotion, keywords in EMOTION_KEYWORDS.items():
        for keyword in keywords:
            if keyword in text:
                weight = 1 + len(keyword.split()) * 0.5
                scores[emotion] += weight

    for emotion, patterns in STRONG_PATTERNS.items():
        for pattern in patterns:
            if pattern in text:
                scores[emotion] += 3.0

    sentiment = _vader.polarity_scores(text)
    if sentiment["compound"] >= 0.4 and scores["happy"] == 0:
        scores["happy"] += 1.5
    elif sentiment["compound"] <= -0.4:
        if scores["angry"] == 0 and scores["sad"] == 0:
            scores["sad"] += 1.5

    if max(scores.values()) == 0:
        if any(pattern in text for pattern in NEUTRAL_COMMAND_PATTERNS) or text.endswith("?"):
            scores["neutral"] += 2.0

    if max(scores.values()) == 0:
        try:
            blob_polarity = TextBlob(text).sentiment.polarity
            if blob_polarity >= 0.35:
                scores["happy"] += 1.2
            elif blob_polarity <= -0.35:
                scores["sad"] += 1.2
        except Exception:
            pass

    if max(scores.values()) == 0:
        return {"emotion": "neutral", "confidence": 0.55, "source": "fallback", "all_scores": scores}

    winner = max(scores, key=scores.get)
    total = sum(scores.values())
    confidence = min(0.97, 0.60 + (scores[winner] / total) * 0.37)

    return {
        "emotion": winner,
        "confidence": round(confidence, 2),
        "source": "text",
        "all_scores": scores,
    }


# =============================================================================
# Audio fallback model
# =============================================================================

def _normalize_audio_scores(raw_scores: Dict[str, float]) -> Dict[str, float]:
    mapped = {
        "sad": float(raw_scores.get("sad", 0.0)),
        "happy": float(raw_scores.get("happy", 0.0)),
        "angry": float(raw_scores.get("angry", 0.0)),
        "fear": 0.0,
        "neutral": float(raw_scores.get("neutral", 0.0)),
    }

    total = sum(mapped.values())
    if total > 0:
        mapped = {emotion: score / total for emotion, score in mapped.items()}
    else:
        mapped["neutral"] = 1.0
    return mapped


def speechbrain_detect(filepath: str) -> Dict[str, Any]:
    if not filepath or not Path(filepath).exists():
        raise FileNotFoundError(f"Audio file not found: {filepath}")

    if not _load_model():
        raise RuntimeError("SpeechBrain model could not be loaded")

    audio, sr = librosa.load(filepath, sr=16000, mono=True)
    if audio.size == 0:
        raise ValueError("Audio file is empty")

    audio_tensor = torch.tensor(audio, dtype=torch.float32).unsqueeze(0).to(_get_device())

    with torch.no_grad():
        wav2vec_out = _classifier.mods.wav2vec2(audio_tensor)
        embeddings = wav2vec_out.last_hidden_state if hasattr(wav2vec_out, "last_hidden_state") else wav2vec_out[0]
        embeddings = _classifier.mods.avg_pool(embeddings)
        logits = _classifier.mods.output_mlp(embeddings).squeeze()
        probs = torch.softmax(logits, dim=-1).detach().cpu().numpy()

    raw_scores = {label: float(prob) for label, prob in zip(MODEL_LABELS, probs)}
    all_scores = _normalize_audio_scores(raw_scores)
    winner = max(all_scores, key=all_scores.get)

    return {
        "emotion": winner,
        "confidence": round(float(all_scores[winner]), 2),
        "all_scores": all_scores,
        "detection_method": "audio_only",
        "source": "audio",
        "raw_scores": raw_scores,
    }


# =============================================================================
# Main detection entrypoint
# =============================================================================

def detect_emotion(filepath: str, transcript: str = "") -> Dict[str, Any]:
    transcript = (transcript or "").strip()

    if transcript and len(transcript) > 3:
        text_result = detect_from_text(transcript)
        text_has_signal = max(text_result.get("all_scores", {}).values() or [0.0]) > 0
        if text_result["confidence"] >= 0.65 or text_has_signal:
            return {
                "emotion": text_result["emotion"],
                "confidence": text_result["confidence"],
                "all_scores": text_result.get("all_scores", {}),
                "detection_method": "text_primary",
                "source": "text",
            }
    else:
        text_result = {"emotion": "neutral", "confidence": 0.55, "all_scores": {emotion: 0.0 for emotion in EMOTION_KEYWORDS}}

    try:
        audio_result = speechbrain_detect(filepath)

        if transcript and len(transcript) > 3:
            emotions = RESULT_EMOTIONS
            blended = {}
            for emotion in emotions:
                text_score = 1.0 if text_result["emotion"] == emotion else 0.1
                audio_score = audio_result["all_scores"].get(emotion, 0.1)
                blended[emotion] = text_score * 0.65 + audio_score * 0.35

            winner = max(blended, key=blended.get)
            confidence = min(0.93, blended[winner])
            return {
                "emotion": winner,
                "confidence": round(float(confidence), 2),
                "all_scores": blended,
                "detection_method": "blended",
                "source": "text+audio",
                "text_result": text_result,
                "audio_result": audio_result,
            }

        return audio_result

    except Exception as exc:
        if transcript:
            fallback = detect_from_text(transcript)
            fallback["detection_method"] = "text_fallback"
            fallback["error"] = str(exc)
            return fallback
        return {
            "emotion": "neutral",
            "confidence": 0.5,
            "detection_method": "fallback",
            "source": "fallback",
            "error": str(exc),
            "all_scores": {emotion: 0.0 for emotion in EMOTION_KEYWORDS},
        }


def get_emotion_intensity(emotion: str, audio_features: Dict[str, Any] | None = None) -> float:
    weights = {
        "angry": 0.9,
        "happy": 0.8,
        "fear": 0.85,
        "sad": 0.65,
        "neutral": 0.4,
    }
    return weights.get((emotion or "neutral").lower(), 0.5)


if __name__ == "__main__":
    test_cases = [
        ("I am feeling so angry. I will fuck you bitch.", "angry"),
        ("I am feeling so sad.", "sad"),
        ("I am feeling so low today. Help me.", "sad"),
        ("I am so happy today!", "happy"),
        ("I am scared and anxious.", "fear"),
        ("What time is it?", "neutral"),
    ]

    print("EMOTION DETECTION TEST:")
    passed = 0
    for text, expected in test_cases:
        result = detect_from_text(text)
        status = "PASS" if result["emotion"] == expected else "FAIL"
        print(
            f"{status} '{text[:40]}' -> {result['emotion']} "
            f"({result['confidence']:.0%}) expected: {expected}"
        )
        if result["emotion"] == expected:
            passed += 1

    print(f"\nScore: {passed}/{len(test_cases)}")
