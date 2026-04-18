"""
Action Executor Module for EMPATHIX
Executes OS commands based on parsed intents.
Supports Windows, macOS, and Linux with automatic fallbacks.
"""

import os
import platform
import subprocess
import webbrowser
import asyncio
from datetime import datetime
from pathlib import Path
from typing import Optional
from dataclasses import dataclass

try:
    import pyautogui
    PYAUTOGUI_AVAILABLE = True
except ImportError:
    PYAUTOGUI_AVAILABLE = False

# =============================================================================
# Configuration
# =============================================================================

OS = platform.system()

ACTION_MESSAGES = {
    "open_spotify": "Opening Spotify for you",
    "open_chrome": "Opening Google Chrome",
    "open_youtube": "Opening YouTube",
    "open_whatsapp": "Opening WhatsApp",
    "open_calculator": "Opening the calculator",
    "do_search": "Searching for that",
    "get_time": "Fetching the current time",
    "get_date": "Fetching today's date",
    "take_screenshot": "Taking a screenshot",
    "media_play": "Playing media",
    "media_pause": "Pausing media",
    "media_volume_up": "Turning the volume up",
    "media_volume_down": "Turning the volume down",
    "media_mute": "Muting the audio",
}


# =============================================================================
# Helper Functions
# =============================================================================

def _get_desktop_path() -> Path:
    """Get the desktop path for current OS."""
    home = Path.home()
    if OS == "Windows":
        return home / "Desktop"
    elif OS == "Darwin":
        return home / "Desktop"
    else:
        return home / "Desktop"


def _check_command_exists(command: str) -> bool:
    """Check if a command exists on the system."""
    try:
        if OS == "Windows":
            result = subprocess.run(
                ["where", command],
                capture_output=True,
                timeout=5,
                shell=False
            )
        else:
            result = subprocess.run(
                ["which", command],
                capture_output=True,
                timeout=5
            )
        return result.returncode == 0
    except Exception:
        return False


def _check_app_installed(app_name: str) -> bool:
    """Check if an application is installed."""
    try:
        if OS == "Darwin":
            result = subprocess.run(
                ["mdfind", f"kMDItemFSName == '{app_name}.app'"],
                capture_output=True,
                timeout=5,
                text=True
            )
            return len(result.stdout.strip()) > 0
        elif OS == "Linux":
            return _check_command_exists(app_name.lower())
        elif OS == "Windows":
            return True
        return False
    except Exception:
        return False


# =============================================================================
# Action Functions
# =============================================================================

def open_spotify() -> dict:
    """Open Spotify app or web player."""
    try:
        if OS == "Windows":
            subprocess.Popen(["start", "spotify"], shell=True)
        elif OS == "Darwin":
            if _check_app_installed("Spotify"):
                subprocess.Popen(["open", "-a", "Spotify"])
            else:
                raise RuntimeError("Spotify not installed")
        elif OS == "Linux":
            if _check_command_exists("spotify"):
                subprocess.Popen(["spotify"])
            else:
                raise RuntimeError("Spotify not installed")
        else:
            raise RuntimeError("Unsupported OS")

        return {"success": True, "message": ACTION_MESSAGES["open_spotify"]}
    except Exception as e:
        webbrowser.open("https://open.spotify.com")
        return {
            "success": True,
            "message": "Opening Spotify web player (app not found)",
            "fallback": True
        }


def open_chrome() -> dict:
    """Open Google Chrome browser."""
    try:
        if OS == "Windows":
            subprocess.Popen(["start", "chrome"], shell=True)
        elif OS == "Darwin":
            if _check_app_installed("Google Chrome"):
                subprocess.Popen(["open", "-a", "Google Chrome"])
            else:
                raise RuntimeError("Chrome not installed")
        elif OS == "Linux":
            if _check_command_exists("google-chrome"):
                subprocess.Popen(["google-chrome"])
            elif _check_command_exists("chromium"):
                subprocess.Popen(["chromium"])
            else:
                raise RuntimeError("Chrome not installed")
        else:
            raise RuntimeError("Unsupported OS")

        return {"success": True, "message": ACTION_MESSAGES["open_chrome"]}
    except Exception as e:
        webbrowser.open("https://google.com")
        return {
            "success": True,
            "message": "Opening browser to Google (Chrome not found)",
            "fallback": True
        }


def open_youtube() -> dict:
    """Open YouTube in default browser."""
    try:
        webbrowser.open("https://youtube.com")
        return {"success": True, "message": ACTION_MESSAGES["open_youtube"]}
    except Exception as e:
        return {"success": False, "message": f"Failed to open YouTube: {str(e)}"}


def open_whatsapp() -> dict:
    """Open WhatsApp app or web."""
    try:
        if OS == "Windows":
            subprocess.Popen(["start", "whatsapp"], shell=True)
        elif OS == "Darwin":
            if _check_app_installed("WhatsApp"):
                subprocess.Popen(["open", "-a", "WhatsApp"])
            else:
                raise RuntimeError("WhatsApp not installed")
        else:
            raise RuntimeError("Linux: using web fallback")

        return {"success": True, "message": ACTION_MESSAGES["open_whatsapp"]}
    except Exception as e:
        webbrowser.open("https://web.whatsapp.com")
        return {
            "success": True,
            "message": "Opening WhatsApp Web (app not found)",
            "fallback": True
        }


def open_calculator() -> dict:
    """Open system calculator."""
    try:
        if OS == "Windows":
            subprocess.Popen(["calc"])
        elif OS == "Darwin":
            subprocess.Popen(["open", "-a", "Calculator"])
        elif OS == "Linux":
            if _check_command_exists("gnome-calculator"):
                subprocess.Popen(["gnome-calculator"])
            elif _check_command_exists("kcalc"):
                subprocess.Popen(["kcalc"])
            elif _check_command_exists("xcalc"):
                subprocess.Popen(["xcalc"])
            else:
                raise RuntimeError("No calculator found")
        else:
            raise RuntimeError("Unsupported OS")

        return {"success": True, "message": ACTION_MESSAGES["open_calculator"]}
    except Exception as e:
        webbrowser.open("https://www.google.com/search?q=calculator")
        return {
            "success": True,
            "message": "Opening Google Calculator (system calc not found)",
            "fallback": True
        }


def do_search(query: str) -> dict:
    """Search Google for the query."""
    try:
        encoded_query = query.replace(" ", "+")
        webbrowser.open(f"https://google.com/search?q={encoded_query}")
        return {
            "success": True,
            "message": f"Searching Google for: {query}"
        }
    except Exception as e:
        return {"success": False, "message": f"Failed to search: {str(e)}"}


def get_time() -> dict:
    """Get current time."""
    try:
        now = datetime.now()
        time_str = now.strftime("%I:%M %p")
        return {
            "success": True,
            "message": f"The current time is {time_str}",
            "data": time_str
        }
    except Exception as e:
        return {"success": False, "message": f"Failed to get time: {str(e)}"}


def get_date() -> dict:
    """Get current date."""
    try:
        now = datetime.now()
        date_str = now.strftime("%A, %B %d, %Y")
        return {
            "success": True,
            "message": f"Today is {date_str}",
            "data": date_str
        }
    except Exception as e:
        return {"success": False, "message": f"Failed to get date: {str(e)}"}


def take_screenshot() -> dict:
    """Take screenshot and save to desktop."""
    if not PYAUTOGUI_AVAILABLE:
        return {
            "success": False,
            "message": "Screenshot feature unavailable - pyautogui not installed"
        }

    try:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        desktop = _get_desktop_path()
        desktop.mkdir(parents=True, exist_ok=True)

        filename = f"empathix_screenshot_{timestamp}.png"
        filepath = desktop / filename

        screenshot = pyautogui.screenshot()
        screenshot.save(str(filepath))

        return {
            "success": True,
            "message": f"Screenshot saved to Desktop as {filename}",
            "filepath": str(filepath)
        }
    except Exception as e:
        return {"success": False, "message": f"Failed to take screenshot: {str(e)}"}


def media_control(action: str) -> dict:
    """Control media playback using pyautogui keys."""
    if not PYAUTOGUI_AVAILABLE:
        return {
            "success": False,
            "message": "Media control unavailable - pyautogui not installed"
        }

    action_map = {
        "play": "playpause",
        "pause": "playpause",
        "playpause": "playpause",
        "volume_up": "volumeup",
        "volumeup": "volumeup",
        "volume_down": "volumedown",
        "volumedown": "volumedown",
        "mute": "volumemute",
        "volumemute": "volumemute",
    }

    normalized_action = action.lower().replace("_", "").replace("-", "")
    key = action_map.get(normalized_action)

    if not key:
        return {
            "success": False,
            "message": f"Unknown media action: {action}"
        }

    try:
        pyautogui.press(key)

        message_map = {
            "playpause": ACTION_MESSAGES["media_play"],
            "volumeup": ACTION_MESSAGES["media_volume_up"],
            "volumedown": ACTION_MESSAGES["media_volume_down"],
            "volumemute": ACTION_MESSAGES["media_mute"],
        }

        return {
            "success": True,
            "message": message_map.get(key, f"Media action {action} executed")
        }
    except Exception as e:
        return {"success": False, "message": f"Media control failed: {str(e)}"}


# =============================================================================
# Main Runner
# =============================================================================

async def run_action(intent: dict) -> dict:
    """
    Execute the detected intent.

    Args:
        intent: Dictionary with at least 'intent_type' key
               May include 'query' for search actions

    Returns:
        Dictionary with success status, action taken, message, and optional error
        Format:
        {
            "success": bool,
            "action_taken": str,
            "message": str,
            "error": str | None,
            "filepath": str | None,  # only for screenshot
            "data": str | None       # only for time/date
        }
    """
    intent_type = intent.get("intent_type", "unknown")
    query = intent.get("query", "")

    result = {
        "success": False,
        "action_taken": intent_type,
        "message": "",
        "error": None,
        "filepath": None,
        "data": None
    }

    try:
        if intent_type == "open_spotify":
            action_result = await asyncio.to_thread(open_spotify)

        elif intent_type == "open_chrome":
            action_result = await asyncio.to_thread(open_chrome)

        elif intent_type == "open_youtube":
            action_result = await asyncio.to_thread(open_youtube)

        elif intent_type == "open_whatsapp":
            action_result = await asyncio.to_thread(open_whatsapp)

        elif intent_type == "open_calculator":
            action_result = await asyncio.to_thread(open_calculator)

        elif intent_type == "do_search":
            action_result = await asyncio.to_thread(do_search, query)

        elif intent_type == "get_time":
            action_result = await asyncio.to_thread(get_time)

        elif intent_type == "get_date":
            action_result = await asyncio.to_thread(get_date)

        elif intent_type == "take_screenshot":
            action_result = await asyncio.to_thread(take_screenshot)

        elif intent_type.startswith("media_"):
            action_result = await asyncio.to_thread(media_control, intent_type)

        else:
            result["message"] = f"Unknown intent: {intent_type}"
            result["error"] = "Intent not recognized"
            return result

        # Merge action result into result dict
        result["success"] = action_result.get("success", False)
        result["message"] = action_result.get("message", "Action completed")

        if "filepath" in action_result:
            result["filepath"] = action_result["filepath"]
        if "data" in action_result:
            result["data"] = action_result["data"]

    except Exception as e:
        result["success"] = False
        result["message"] = f"Action failed: {str(e)}"
        result["error"] = str(e)

    return result


# =============================================================================
# Direct Execution
# =============================================================================

if __name__ == "__main__":
    import asyncio

    async def test_actions():
        """Test all actions."""
        print("=" * 60)
        print("EMPATHIX Action Executor - Test Mode")
        print(f"Detected OS: {OS}")
        print(f"PyAutoGUI: {'Available' if PYAUTOGUI_AVAILABLE else 'Not Available'}")
        print("=" * 60)

        test_intents = [
            {"intent_type": "get_time"},
            {"intent_type": "get_date"},
            {"intent_type": "do_search", "query": "Python programming"},
        ]

        for intent in test_intents:
            print(f"\nTesting: {intent['intent_type']}")
            result = await run_action(intent)
            print(f"  Success: {result['success']}")
            print(f"  Message: {result['message']}")
            if result['error']:
                print(f"  Error: {result['error']}")

        print("\n" + "=" * 60)
        print("Test complete!")

    asyncio.run(test_actions())
