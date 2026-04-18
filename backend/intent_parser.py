"""
Intent Parser Module for EMPATHIX
Detects user commands from transcript text using fuzzy matching
"""

import re
from typing import Dict, Any, Optional
from dataclasses import dataclass

try:
    from rapidfuzz import fuzz, process
    RAPIDFUZZ_AVAILABLE = True
except ImportError:
    RAPIDFUZZ_AVAILABLE = False


@dataclass
class IntentResult:
    """Structured intent detection result."""
    has_intent: bool
    intent_type: str
    app_name: Optional[str] = None
    action: Optional[str] = None
    query: Optional[str] = None
    raw_match: Optional[str] = None
    requires_confirmation: bool = False


# App name mappings: synonyms → canonical app name
APP_SYNONYMS = {
    # Spotify
    "spotify": ["spotify", "music app", "music player"],
    # Chrome/Browser
    "chrome": ["chrome", "google chrome", "browser", "google"],
    # YouTube
    "youtube": ["youtube", "utube", "video player"],
    # Notepad
    "notepad": ["notepad", "notes", "note pad", "text editor"],
    # WhatsApp
    "whatsapp": ["whatsapp", "whats app", "messages"],
    # Calculator
    "calculator": ["calculator", "calc"],
    # File Manager
    "files": ["file manager", "files", "explorer", "file explorer"],
    # Terminal
    "terminal": ["terminal", "cmd", "command prompt", "powershell", "console"],
    # Settings
    "settings": ["settings", "system settings", "preferences", "control panel"],
    # VS Code
    "vscode": ["vscode", "vs code", "visual studio code", "code editor"],
    # Discord
    "discord": ["discord"],
}

# Action phrases
OPEN_PHRASES = [
    "open", "launch", "start", "run", "play", "load", "begin",
    "fire up", "boot up", "bring up", "show me", "take me to"
]

CLOSE_PHRASES = [
    "close", "exit", "quit", "shut down", "stop", "kill",
    "end", "terminate"
]

# Media control phrases
MEDIA_COMMANDS = {
    "play_music": ["play music", "start music", "resume music"],
    "pause_music": ["pause music", "pause", "hold music"],
    "stop_music": ["stop music", "end music", "quit music"],
    "next_track": ["next song", "next track", "skip", "forward"],
    "prev_track": ["previous song", "previous track", "back", "go back"],
    "volume_up": ["volume up", "increase volume", "louder", "turn it up"],
    "volume_down": ["volume down", "decrease volume", "quieter", "turn it down", "softer"],
    "mute": ["mute", "silence", "turn off sound", "no sound"],
    "unmute": ["unmute", "turn on sound", "sound on"],
}

# System commands
SYSTEM_COMMANDS = {
    "screenshot": ["take screenshot", "capture screen", "screenshot", "screen capture", "print screen"],
    "current_time": ["what time is it", "current time", "what's the time", "tell me the time", "time now"],
    "current_date": ["what is today", "current date", "what's today", "today's date", "what day is it"],
    "shutdown": ["shutdown", "shut down", "turn off computer", "power off"],
    "restart": ["restart", "reboot", "restart computer", "reboot system"],
    "sleep": ["sleep", "go to sleep", "hibernate"],
    "lock": ["lock screen", "lock computer", "lock pc"],
}

# Search prefixes
SEARCH_PREFIXES = [
    "search", "search for", "look up", "lookup", "find",
    "google", "google for", "bing", "youtube search",
    "find me", "show me", "search up"
]


def extract_search_query(transcript: str) -> Optional[str]:
    """
    Extract search query from transcript.

    Examples:
        "search for cats" -> "cats"
        "look up weather in New York" -> "weather in New York"
        "google python tutorial" -> "python tutorial"
    """
    transcript_lower = transcript.lower().strip()

    for prefix in SEARCH_PREFIXES:
        if transcript_lower.startswith(prefix):
            query = transcript_lower[len(prefix):].strip()
            # Remove leading articles
            query = re.sub(r'^(for|about|on)\s+', '', query)
            return query if query else None

    # Check for "search [query]" or "look up [query]" in middle of sentence
    patterns = [
        r'search\s+(?:for\s+)?["\']?(.+?)["\']?(?:\s+(?:on|in)\s+\w+)?$',
        r'look\s+up\s+["\']?(.+?)["\']?$',
        r'google\s+(?:for\s+)?["\']?(.+?)["\']?$',
        r'find\s+(?:me\s+)?["\']?(.+?)["\']?$',
    ]

    for pattern in patterns:
        match = re.search(pattern, transcript_lower)
        if match:
            return match.group(1).strip()

    return None


def _fuzzy_match(text: str, choices: list, threshold: int = 70) -> tuple:
    """
    Find best fuzzy match using rapidfuzz.
    Returns (match, score) or (None, 0) if no good match.
    """
    if not RAPIDFUZZ_AVAILABLE:
        # Fallback to simple containment check
        text_lower = text.lower()
        for choice in choices:
            if choice.lower() in text_lower:
                return (choice, 100)
        return (None, 0)

    result = process.extractOne(text, choices, scorer=fuzz.partial_ratio)
    if result and result[1] >= threshold:
        return (result[0], result[1])
    return (None, 0)


def _detect_open_app(transcript: str) -> Optional[IntentResult]:
    """Detect open/launch app intent."""
    transcript_lower = transcript.lower().strip()

    # Check for open phrases
    open_phrase, score = _fuzzy_match(transcript_lower, OPEN_PHRASES, threshold=80)

    if not open_phrase and not any(p in transcript_lower for p in OPEN_PHRASES):
        return None

    # Look for app names
    for canonical_app, synonyms in APP_SYNONYMS.items():
        for synonym in synonyms:
            if synonym in transcript_lower:
                # Check if it's preceded by an action word
                idx = transcript_lower.find(synonym)
                before = transcript_lower[:idx].strip()

                # Must have an action word or be at start
                has_action = any(p in before for p in OPEN_PHRASES) or not before

                if has_action or open_phrase:
                    return IntentResult(
                        has_intent=True,
                        intent_type="open_app",
                        app_name=canonical_app,
                        action="open",
                        query=None,
                        raw_match=transcript.strip(),
                        requires_confirmation=False
                    )

    return None


def _detect_search(transcript: str) -> Optional[IntentResult]:
    """Detect search intent."""
    query = extract_search_query(transcript)

    if query:
        return IntentResult(
            has_intent=True,
            intent_type="search",
            app_name=None,
            action="search",
            query=query,
            raw_match=transcript.strip(),
            requires_confirmation=False
        )

    return None


def _detect_media(transcript: str) -> Optional[IntentResult]:
    """Detect media control intent."""
    transcript_lower = transcript.lower().strip()

    for action, phrases in MEDIA_COMMANDS.items():
        for phrase in phrases:
            if phrase in transcript_lower:
                # Map action to intent type
                action_map = {
                    "play_music": ("media", "play"),
                    "pause_music": ("media", "pause"),
                    "stop_music": ("media", "stop"),
                    "next_track": ("media", "next"),
                    "prev_track": ("media", "previous"),
                    "volume_up": ("media", "volume_up"),
                    "volume_down": ("media", "volume_down"),
                    "mute": ("media", "mute"),
                    "unmute": ("media", "unmute"),
                }

                intent_type, media_action = action_map.get(action, ("media", "control"))

                return IntentResult(
                    has_intent=True,
                    intent_type=intent_type,
                    app_name="media_player",
                    action=media_action,
                    query=None,
                    raw_match=transcript.strip(),
                    requires_confirmation=False
                )

    return None


def _detect_system(transcript: str) -> Optional[IntentResult]:
    """Detect system command intent."""
    transcript_lower = transcript.lower().strip()

    for action, phrases in SYSTEM_COMMANDS.items():
        for phrase in phrases:
            if phrase in transcript_lower:
                # Determine if confirmation required
                needs_confirmation = action in ["shutdown", "restart", "sleep"]

                # Map action to intent
                intent_map = {
                    "screenshot": "screenshot",
                    "current_time": "system_time",
                    "current_date": "system_date",
                    "shutdown": "system_shutdown",
                    "restart": "system_restart",
                    "sleep": "system_sleep",
                    "lock": "system_lock",
                }

                intent_type = intent_map.get(action, "system")

                return IntentResult(
                    has_intent=True,
                    intent_type=intent_type,
                    app_name="system",
                    action=action.replace("_", ""),
                    query=None,
                    raw_match=transcript.strip(),
                    requires_confirmation=needs_confirmation
                )

    return None


async def check_intent(transcript: str) -> Dict[str, Any]:
    """
    Detect user command from transcript text.

    Args:
        transcript: User's speech transcript

    Returns:
        Dictionary with intent detection results:
        {
            "has_intent": bool,
            "intent_type": str,
            "app_name": str or null,
            "action": str or null,
            "query": str or null,
            "raw_match": str or null,
            "requires_confirmation": bool
        }
    """
    if not transcript or not transcript.strip():
        return {
            "has_intent": False,
            "intent_type": "conversation",
            "app_name": None,
            "action": None,
            "query": None,
            "raw_match": None,
            "requires_confirmation": False
        }

    transcript = transcript.strip()

    # Check intents in order of specificity
    detectors = [
        _detect_open_app,
        _detect_media,
        _detect_search,
        _detect_system,
    ]

    for detector in detectors:
        result = detector(transcript)
        if result:
            return {
                "has_intent": result.has_intent,
                "intent_type": result.intent_type,
                "app_name": result.app_name,
                "action": result.action,
                "query": result.query,
                "raw_match": result.raw_match,
                "requires_confirmation": result.requires_confirmation
            }

    # No intent found - treat as conversation
    return {
        "has_intent": False,
        "intent_type": "conversation",
        "app_name": None,
        "action": None,
        "query": None,
        "raw_match": transcript,
        "requires_confirmation": False
    }


# Convenience function for backward compatibility
def check_intent_sync(transcript: str) -> Dict[str, Any]:
    """Synchronous wrapper for check_intent."""
    import asyncio
    return asyncio.run(check_intent(transcript))


# =============================================================================
# Test
# =============================================================================

if __name__ == "__main__":
    import asyncio

    async def test():
        print("=" * 60)
        print("EMPATHIX Intent Parser - Test Mode")
        print("=" * 60)
        print(f"RapidFuzz available: {RAPIDFUZZ_AVAILABLE}")
        print()

        test_cases = [
            # Open app intents
            ("open spotify", "open_app"),
            ("play spotify", "open_app"),
            ("launch chrome", "open_app"),
            ("opn spotify", "open_app"),  # fuzzy match
            ("open spotfy", "open_app"),  # fuzzy match

            # Search intents
            ("search for cats", "search"),
            ("google python tutorial", "search"),
            ("look up weather in New York", "search"),
            ("find me the best restaurants", "search"),

            # Media intents
            ("play music", "media"),
            ("pause", "media"),
            ("volume up", "media"),
            ("mute", "media"),

            # System intents
            ("take screenshot", "screenshot"),
            ("what time is it", "system_time"),
            ("shutdown", "system_shutdown"),

            # Conversation (no intent)
            ("I'm feeling happy today", "conversation"),
            ("what do you think about AI", "conversation"),
        ]

        for transcript, expected in test_cases:
            print(f"\nTest: '{transcript}'")
            print(f"Expected: {expected}")

            result = await check_intent(transcript)
            print(f"Result: {result['intent_type']}")
            print(f"  has_intent: {result['has_intent']}")
            print(f"  app_name: {result['app_name']}")
            print(f"  action: {result['action']}")
            print(f"  query: {result['query']}")
            print(f"  requires_confirmation: {result['requires_confirmation']}")

            if result['intent_type'] == expected:
                print("  ✓ PASS")
            else:
                print(f"  ✗ FAIL (expected {expected})")

        print(f"\n{'=' * 60}")
        print("Test complete!")

    asyncio.run(test())
