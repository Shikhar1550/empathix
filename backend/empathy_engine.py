"""
Empathy Engine Module for EMPATHIX
Generates emotionally-aware responses using Claude API
"""

import os
import asyncio
import random
import time
from collections import OrderedDict
from typing import List, Dict, Any

from anthropic import AsyncAnthropic

# Initialize Anthropic client - ensure we use the official API, not Ollama
api_key = os.getenv("ANTHROPIC_API_KEY")
CLAUDE_MODEL = os.getenv("DEFAULT_CLAUDE_MODEL", "claude-sonnet-4-20250514")
# Check if API key is valid (not empty, not placeholder)
ANTHROPIC_AVAILABLE = api_key and api_key.strip() and api_key != "your_key_here" and len(api_key) > 20

if ANTHROPIC_AVAILABLE:
    anthropic_client = AsyncAnthropic(
        api_key=api_key,
        base_url="https://api.anthropic.com"
    )
else:
    anthropic_client = None
    print("[EmpathyEngine] ANTHROPIC_API_KEY not set - using fallback responses")

# Emotion-based system prompts - TUNED for voice emotion detection
EMOTION_PROMPTS = {
    "sad": """You are a warm, gentle, caring assistant. The user SOUNDS sad (detected from their voice tone).
IMPORTANT: Their words may say "fine" but their tone reveals they're not. Respond to their EMOTION, not their words.
Speak with gentle concern, empathy, and comfort. Acknowledge their feelings softly. Avoid cheerful or upbeat responses.
Examples: "I hear sadness in your voice..." / "You don't have to be okay right now..." / "I'm here with you..."
Keep response under 35 words. Be genuinely comforting, not dismissive.""",

    "happy": """You are an upbeat, energetic assistant matching the user's joyful mood (detected from their voice).
Be enthusiastic, positive, and celebratory. If they give a command (like "Open Spotify"), be cheerful AND confirm you'll do it.
Share in their happiness while being helpful.
Examples: "Absolutely! Opening that now with a smile!" / "Love your energy! Let's do this!"
Keep response under 35 words.""",

    "angry": """You are a calm, validating assistant. The user SOUNDS frustrated/angry (detected from their voice tone).
IMPORTANT: Their words may sound positive ("everything is great") but their angry tone reveals otherwise. Trust the emotion over the words.
Stay calm, soothing, and validating. Acknowledge their frustration without escalating. Help them feel heard.
Examples: "I hear the frustration..." / "That sounds really difficult..." / "I'm here to help calm things down..."
Keep response under 35 words. Be the calm in their storm.""",

    "fearful": """You are a reassuring, steady, calming assistant. The user SOUNDS afraid or anxious (detected from their voice).
Provide comfort, stability, and gentle confidence. Offer concrete help when they're overwhelmed.
Examples: "You've got this, and I'm here to help..." / "Let's take this one step together..." / "I can help you figure this out..."
Keep response under 35 words. Be their steady anchor.""",

    "neutral": """You are a friendly, efficient assistant. The user sounds neutral - give a quick, warm, helpful response.
Be conversational but concise. Answer directly without over-explaining.
Keep response under 25 words. Friendly efficiency.""",

    "surprised": """You are an engaged, curious assistant responding to someone who sounds surprised.
Match their energy with interest and openness.
Keep response under 35 words.""",

    "disgusted": """You are an understanding assistant acknowledging someone's distaste.
Be validating but shift toward constructive tone.
Keep response under 35 words.""",

    "excited": """You are an enthusiastic assistant matching the user's excited energy.
Be energetic, celebratory, and engaged.
Keep response under 35 words.""",

    "calm": """You are a peaceful, soothing assistant speaking to someone who sounds calm.
Maintain tranquility and gentle presence.
Keep response under 35 words."""
}

# Hinglish (Hindi + English mix) prompts by emotion
HINGLISH_EMOTION_PROMPTS = {
    "sad": """Arre yaar, kya hua? Sab theek ho jaayega, main hoon na. Tension mat lo.""",
    "happy": """Wah bhai wah! Bahut achha lag raha hai sunke! Mazaa aa gaya!""",
    "angry": """Chill karo yaar, sab sort out ho jaayega. Gussa chhodo, relax karo.""",
    "fearful": """Tension mat lo yaar, main hoon na tere saath. Sab theek ho jayega.""",
    "neutral": """Haan bolo, main sun raha hoon. Kya chahiye batao?""",
    "surprised": """Arre wah! Ye toh surprise hai! Maza aa gaya!""",
    "disgusted": """Arre yaar, ignore karo. Chhodo usko, aage badhte hain.""",
    "excited": """Wah wah! Kya baat hai! Bahut excited lag rahe ho!""",
    "calm": """Theek hai yaar, shaanti se baat karte hain. Kya hua batao?""",
}

# Hinglish system prompt for Claude
HINGLISH_SYSTEM_PROMPT = """LANGUAGE RULE: User is speaking in Hinglish (Hindi+English mix).
You MUST respond in natural Hinglish — mix Hindi and English exactly like a young Indian friend would speak.

Examples of correct Hinglish responses:
- Sad: "Arre yaar, kya hua? Sab theek ho jaayega, main hoon na."
- Happy: "Wah bhai wah! Bahut achha lag raha hai sunke!"
- Angry: "Chill karo yaar, sab sort out ho jaayega."
- Fear: "Tension mat lo, main hoon na tere saath."
- Neutral: "Haan bolo, main sun raha hoon. Kya chahiye?"

Rules for Hinglish:
- Mix Hindi and English naturally (not 100% Hindi)
- Use casual words: yaar, bhai, arre, na, toh, kya, bas
- Keep sentences short, max 2 lines
- Sound like a caring friend, not a robot
- Actions like "Opening Spotify" stay in English"""

# Fallback responses by emotion - tuned for Task 2
FALLBACK_RESPONSES = {
    "sad": [
        "I hear the sadness in your voice. You don't have to be okay right now.",
        "Take your time. I'm here for you and I'm listening.",
        "It sounds like you're going through a lot right now."
    ],
    "happy": [
        "Love your energy! I'm on it with a big smile!",
        "Your excitement is so contagious! Let's do this!",
        "Sounds like a great mood! How can I keep the good vibes going?"
    ],
    "angry": [
        "I hear the frustration. Let's breathe and work through this together.",
        "That sounds really annoying. Let me help make it better.",
        "I understand why you'd be upset. Let's fix this step by step."
    ],
    "fearful": [
        "You're not alone. I've got you, and we'll figure this out step by step.",
        "It's entirely okay to feel overwhelmed. I am here to assist.",
        "Deep breaths. We can tackle this together."
    ],
    "neutral": [
        "I am ready. Anything else I can help with?",
        "What's on your mind today?",
        "I'm here. How can I assist you right now?",
        "How can I help you today?"
    ],
    "surprised": [
        "Wow, that is surprising! Tell me more.",
        "I totally didn't expect that either!",
        "Oh wow! How did that even happen?"
    ],
    "disgusted": [
        "I understand completely. Let's move past that to something better.",
        "That really doesn't sound pleasant at all.",
        "Let's focus on something entirely different then."
    ],
    "excited": [
        "That energy is contagious! I'm excited with you!",
        "Amazing! Tell me what is next!",
        "Woohoo! What are we doing now?"
    ],
    "calm": [
        "Your calm presence is soothing. How can I assist?",
        "It's peaceful right now. What can I do for you?",
        "I'm here whenever you need me."
    ]
}

MAX_RESPONSE_CACHE_SIZE = 20
_response_cache: "OrderedDict[str, str]" = OrderedDict()


def _build_messages(
    transcript: str,
    conversation_history: List[Dict[str, Any]]
) -> List[Dict[str, str]]:
    """Build messages array with history + current user input."""
    messages = []

    # Add conversation history (last 10 turns)
    for turn in conversation_history[-10:]:
        role = turn.get("role", "user")
        content = turn.get("content", "")
        if content:
            messages.append({"role": role, "content": content})

    # Add current user message
    if transcript:
        messages.append({"role": "user", "content": transcript})

    return messages


def _get_system_prompt(emotion: str, confidence: float, language: str = "en") -> str:
    """Get system prompt based on detected emotion and language."""
    # Normalize emotion key
    emotion_lower = emotion.lower() if emotion else "neutral"
    lang_lower = (language or "en").lower()

    # Check if Hinglish or Hindi
    if lang_lower in ("hinglish", "hi"):
        # Use Hinglish system prompt with emotion-specific example
        hinglish_example = HINGLISH_EMOTION_PROMPTS.get(emotion_lower, HINGLISH_EMOTION_PROMPTS["neutral"])
        base_prompt = HINGLISH_SYSTEM_PROMPT + f"\n\nFor this {emotion_lower} emotion, respond similar to: \"{hinglish_example}\""

        # Add confidence context for low confidence detections
        if confidence < 0.5:
            base_prompt += "\nNote: The user's emotion is unclear, so remain adaptable."

        return base_prompt

    # Get base prompt for emotion (English)
    base_prompt = EMOTION_PROMPTS.get(emotion_lower, EMOTION_PROMPTS["neutral"])

    # Add confidence context for low confidence detections
    if confidence < 0.5:
        base_prompt += "\nNote: The user's emotion is unclear, so remain adaptable and observant."

    return base_prompt


def _get_fallback(emotion: str) -> str:
    """Get fallback response for when API fails."""
    emotion_lower = emotion.lower() if emotion else "neutral"
    options = FALLBACK_RESPONSES.get(emotion_lower, FALLBACK_RESPONSES["neutral"])
    return random.choice(options)


def _cache_key(emotion: str, transcript: str) -> str:
    normalized_emotion = (emotion or "neutral").strip().lower()
    normalized_transcript = " ".join((transcript or "").strip().lower().split())
    return f"{normalized_emotion}_{normalized_transcript[:20]}"


def _get_cached_response(emotion: str, transcript: str) -> str | None:
    key = _cache_key(emotion, transcript)
    cached = _response_cache.get(key)
    if cached is not None:
        _response_cache.move_to_end(key)
    return cached


def _store_cached_response(emotion: str, transcript: str, response: str) -> None:
    key = _cache_key(emotion, transcript)
    if key in _response_cache:
        _response_cache.move_to_end(key)
    _response_cache[key] = response
    while len(_response_cache) > MAX_RESPONSE_CACHE_SIZE:
        _response_cache.popitem(last=False)


async def get_empathetic_response(
    emotion: str,
    confidence: float,
    transcript: str,
    conversation_history: List[Dict[str, Any]],
    language: str = "en"
) -> str:
    """
    Generate empathetic response using Claude API.

    Args:
        emotion: Detected emotion (sad, happy, angry, fearful, neutral, etc.)
        confidence: Emotion detection confidence (0.0-1.0)
        transcript: User's speech transcript
        conversation_history: List of last 10 conversation turns
        language: Detected language (en, hi, hinglish)

    Returns:
        Empathetic response string (max 35 words)
    """
    cached_response = _get_cached_response(emotion, transcript)
    if cached_response:
        return cached_response

    # If Hinglish/Hindi and no API key, use Hinglish fallback
    lang_lower = (language or "en").lower()
    if lang_lower in ("hinglish", "hi") and (not ANTHROPIC_AVAILABLE or not anthropic_client):
        fallback = HINGLISH_EMOTION_PROMPTS.get(emotion.lower(), HINGLISH_EMOTION_PROMPTS["neutral"])
        _store_cached_response(emotion, transcript, fallback)
        return fallback

    # If no API key, use fallback immediately
    if not ANTHROPIC_AVAILABLE or not anthropic_client:
        fallback = _get_fallback(emotion)
        _store_cached_response(emotion, transcript, fallback)
        return fallback

    try:
        started_at = time.perf_counter()
        # Build system prompt for emotion and language
        system_prompt = _get_system_prompt(emotion, confidence, language)

        # Build messages with history
        messages = _build_messages(transcript, conversation_history)

        # Handle empty messages case
        if not messages:
            messages = [{"role": "user", "content": transcript or "Hello"}]

        # Call Claude API with streaming for lower perceived latency.
        full_text = ""
        async with anthropic_client.messages.stream(
            model=CLAUDE_MODEL,
            max_tokens=80,
            system=system_prompt,
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                full_text += text

        response_text = full_text.strip()

        # Truncate to ~35 words if needed
        words = response_text.split()
        if len(words) > 35:
            response_text = " ".join(words[:35]) + "..."

        if not response_text:
            response_text = _get_fallback(emotion) if lang_lower == "en" else HINGLISH_EMOTION_PROMPTS.get(emotion.lower(), HINGLISH_EMOTION_PROMPTS["neutral"])

        _store_cached_response(emotion, transcript, response_text)
        elapsed = time.perf_counter() - started_at
        print(f"[EmpathyEngine] Claude stream completed in {elapsed:.2f}s (lang={language})")
        return response_text

    except Exception as e:
        # Log error and return fallback
        print(f"[EmpathyEngine] Claude API error: {e}")
        fallback = _get_fallback(emotion) if lang_lower == "en" else HINGLISH_EMOTION_PROMPTS.get(emotion.lower(), HINGLISH_EMOTION_PROMPTS["neutral"])
        _store_cached_response(emotion, transcript, fallback)
        return fallback


# =============================================================================
# Helper Functions
# =============================================================================

def add_to_history(
    history: List[Dict[str, Any]],
    role: str,
    content: str,
    emotion: str = None,
    max_size: int = 10
) -> List[Dict[str, Any]]:
    """
    Add a turn to conversation history, keeping only last N turns.

    Args:
        history: Current conversation history
        role: 'user' or 'assistant'
        content: Message content
        emotion: Optional emotion tag
        max_size: Maximum history size

    Returns:
        Updated history list
    """
    turn = {
        "role": role,
        "content": content
    }
    if emotion:
        turn["emotion"] = emotion

    history.append(turn)

    # Keep only last max_size turns
    return history[-max_size:]


# =============================================================================
# Test
# =============================================================================

if __name__ == "__main__":
    async def test():
        print("=" * 60)
        print("EMPATHIX Empathy Engine - Test Mode")
        print("=" * 60)

        # Task 2 test cases - emotion from TONE, not words
        test_cases = [
            # Test 1: Words say "fine", tone says sad
            ("sad", 0.88, "I'm fine"),
            # Test 2: Words say "great", tone says angry
            ("angry", 0.82, "Everything is great"),
            # Test 3: Happy command
            ("happy", 0.90, "Open Spotify"),
            # Test 4: Fearful + overwhelmed
            ("fearful", 0.75, "I don't know what to do"),
            # Test 5: Neutral question
            ("neutral", 0.70, "What time is it"),
        ]

        history = []

        expected_feels = [
            "Gentle concern, not cheerful",
            "Calm, validating",
            "Upbeat + executes command",
            "Reassuring + offers help",
            "Quick, friendly answer"
        ]

        for i, (emotion, confidence, transcript) in enumerate(test_cases):
            print(f"\n{'-' * 60}")
            print(f"TEST {i+1}: '{transcript}' (voice tone: {emotion})")
            print(f"Expected feel: {expected_feels[i]}")
            print(f"{'-' * 60}")

            # Check if API key is set
            if not os.getenv("ANTHROPIC_API_KEY"):
                print("[TEST] No API key - using fallback")
                response = _get_fallback(emotion)
            else:
                try:
                    response = await asyncio.wait_for(
                        get_empathetic_response(emotion, confidence, transcript, history),
                        timeout=10.0
                    )
                except asyncio.TimeoutError:
                    print("[TEST] Timeout - using fallback")
                    response = _get_fallback(emotion)

            print(f"Response: {response}")

            # Update history
            history = add_to_history(history, "user", transcript, emotion)
            history = add_to_history(history, "assistant", response)

            print(f"History size: {len(history)} turns")

        print(f"\n{'=' * 60}")
        print("Test complete!")

    asyncio.run(test())
