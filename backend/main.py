"""
EMPATHIX FastAPI Backend - Complete Implementation
Voice-first empathic AI assistant with parallel processing
"""

import os
import asyncio
import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Set, List, Dict, Any
from dataclasses import dataclass

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("empathix")

# Import EMPATHIX modules
import audio_processor
import emotion_detector
import stt_engine
import empathy_engine
import intent_parser
import action_executor
import tts_engine

# Global state
active_websockets: Set[WebSocket] = set()
conversation_history: List[Dict[str, Any]] = []


@dataclass
class AppState:
    """Application state container."""
    emotion: str = "neutral"
    confidence: float = 0.0
    transcript: str = ""
    response: str = ""
    action_taken: str = "none"


app_state = AppState()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    logger.info("EMPATHIX starting up...")

    # Load models
    try:
        emotion_detector._load_model()
        stt_engine.load_whisper_model()
        logger.info("All models loaded successfully")
    except Exception as e:
        logger.error(f"Model loading error: {e}")

    yield

    # Shutdown cleanup
    logger.info("EMPATHIX shutting down...")
    temp_dir = Path("temp_audio")
    if temp_dir.exists():
        for f in temp_dir.glob("*"):
            try:
                f.unlink()
            except:
                pass

    for ws in list(active_websockets):
        try:
            await ws.close()
        except:
            pass
    active_websockets.clear()


# Create FastAPI app
app = FastAPI(
    title="EMPATHIX API",
    description="Voice-first empathic AI assistant",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware - allow Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:3000", "http://localhost:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# WebSocket Broadcast Helper
# =============================================================================

async def broadcast_status(status: str, data: dict = None):
    """Send status update to all connected WebSocket clients."""
    message = {"status": status}
    if data:
        message.update(data)

    disconnected = set()
    for ws in active_websockets:
        try:
            await ws.send_json(message)
        except:
            disconnected.add(ws)

    active_websockets.difference_update(disconnected)


# =============================================================================
# Conversation History Management
# =============================================================================

def add_to_history(role: str, content: str, emotion: str = None):
    """Add a turn to conversation history, keep max 10."""
    global conversation_history

    turn = {"role": role, "content": content}
    if emotion:
        turn["emotion"] = emotion

    conversation_history.append(turn)

    # Keep only last 10 turns
    if len(conversation_history) > 10:
        conversation_history = conversation_history[-10:]


def get_history_for_empathy():
    """Get conversation history formatted for empathy engine."""
    return conversation_history[-10:]  # Last 10 turns


def build_action_intent(parsed_intent: Dict[str, Any]) -> Dict[str, Any]:
    """Map intent parser output to action executor input."""
    intent_type = parsed_intent.get("intent_type", "conversation") if parsed_intent else "conversation"
    app_name = parsed_intent.get("app_name") if parsed_intent else None
    query = parsed_intent.get("query") if parsed_intent else None
    action = parsed_intent.get("action", "playpause") if parsed_intent else "playpause"

    if intent_type == "open_app" and app_name:
        return {"intent_type": f"open_{app_name}", "query": query}
    if intent_type == "spotify_playlist":
        return {"intent_type": "play_spotify_playlist", "query": query}
    if intent_type == "search":
        return {"intent_type": "do_search", "query": query}
    if intent_type == "screenshot":
        return {"intent_type": "take_screenshot", "query": query}
    if intent_type == "media":
        return {"intent_type": f"media_{action}", "query": query}
    if intent_type == "system_time":
        return {"intent_type": "get_time", "query": query}
    if intent_type == "system_date":
        return {"intent_type": "get_date", "query": query}

    return {"intent_type": intent_type, "query": query}


def command_ack(action_intent: Dict[str, Any]) -> str:
    """Fast spoken acknowledgement for background command actions."""
    intent_type = action_intent.get("intent_type", "")
    if intent_type == "play_spotify_playlist":
        return "Playing Energetic Bollywood Songs."
    if intent_type == "open_spotify":
        return "Opening Spotify."
    if intent_type.startswith("open_"):
        app_name = intent_type.replace("open_", "").replace("_", " ").title()
        return f"Opening {app_name}."
    if intent_type.startswith("media_"):
        return "Done."
    if intent_type == "do_search":
        return "Searching now."
    return "On it."


async def process_transcript(transcript: str, emotion: str = "neutral", confidence: float = 0.0) -> Dict[str, Any]:
    """Handle a text transcript through intent detection and empathy generation."""
    cleaned_transcript = (transcript or "").strip()
    if not cleaned_transcript:
        raise HTTPException(status_code=400, detail="Transcript is required")

    parsed_intent = await intent_parser.check_intent(cleaned_transcript)
    logger.info(f"Transcript: {cleaned_transcript}, Intent detected: {parsed_intent}")

    action_taken = "none"
    action_message = None
    intent_type = parsed_intent.get("intent_type", "conversation") if parsed_intent else "conversation"
    has_intent = parsed_intent.get("has_intent", False) if parsed_intent else False

    if has_intent and intent_type != "conversation":
        action_intent = build_action_intent(parsed_intent)
        action_taken = action_intent.get("intent_type", intent_type)

        blocking_actions = {"get_time", "get_date", "take_screenshot"}
        if action_taken in blocking_actions:
            action_result = await run_action_safely(action_intent)
            if action_result.get("success"):
                action_message = action_result.get("message")
            else:
                action_message = action_result.get("message") or "I understood the command, but could not run it."
        else:
            asyncio.create_task(run_action_safely(action_intent))
            action_message = command_ack(action_intent)

        add_to_history("user", cleaned_transcript, emotion)
        add_to_history("assistant", action_message)

        return {
            "emotion": emotion,
            "confidence": float(confidence),
            "transcript": cleaned_transcript,
            "language": "text",
            "response": action_message,
            "action_taken": action_taken,
            "action_message": action_message,
            "intent": parsed_intent,
            "audio_duration": 0.0,
            "fast_path": True,
        }

    add_to_history("user", cleaned_transcript, emotion)
    history = get_history_for_empathy()
    empathetic_response = await empathy_engine.get_empathetic_response(
        emotion, float(confidence), cleaned_transcript, history
    )
    add_to_history("assistant", empathetic_response)

    return {
        "emotion": emotion,
        "confidence": float(confidence),
        "transcript": cleaned_transcript,
        "language": "text",
        "response": empathetic_response,
        "action_taken": action_taken,
        "action_message": action_message,
        "intent": parsed_intent,
        "audio_duration": 0.0,
    }


async def run_action_safely(action_intent: Dict[str, Any]) -> Dict[str, Any]:
    """Run an action and convert exceptions to normal result dictionaries."""
    try:
        logger.info(f"Executing action: {action_intent}")
        action_result = await action_executor.run_action(action_intent)
        logger.info(f"Action result: {action_result}")
        return action_result
    except Exception as e:
        logger.error(f"Action execution error: {e}")
        return {
            "success": False,
            "message": "I understood the command, but the action runner hit an error.",
            "error": str(e)
        }


# =============================================================================
# API Endpoints
# =============================================================================

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "active_connections": len(active_websockets),
        "history_size": len(conversation_history)
    }


@app.post("/api/analyze")
async def analyze_audio(audio: UploadFile = File(...)):
    """
    Main analysis endpoint.
    1. Save + validate audio
    2. Parallel: emotion detection + STT
    3. Get empathetic response (with history)
    4. Check intent + execute action in parallel
    5. Return combined result
    """
    filepath = None
    normalized_path = None
    t1 = 0.0
    t2 = 0.0
    t3 = 0.0

    try:
        request_started = time.perf_counter()
        # Broadcast listening status
        await broadcast_status("listening")

        # Step 1: Save + validate audio
        save_started = time.perf_counter()
        audio_bytes = await audio.read()
        if not audio_bytes or len(audio_bytes) < 1200:
            return JSONResponse(
                status_code=400,
                content={"error": "I heard too little audio. Please try once more."}
            )

        try:
            filepath = await asyncio.to_thread(audio_processor.save_audio_file, audio_bytes)
        except (ValueError, RuntimeError) as e:
            logger.warning(f"Audio conversion rejected: {e}")
            return JSONResponse(
                status_code=400,
                content={"error": "That recording was incomplete or unreadable. Please try again."}
            )

        quality = await asyncio.to_thread(audio_processor.audio_quality_check, filepath)
        if not quality["passed"]:
            return JSONResponse(
                status_code=400,
                content={"error": quality["reason"]}
            )

        # Step 2: Normalize audio
        normalized_path = await asyncio.to_thread(audio_processor.normalize_audio, filepath)
        t1 = time.perf_counter() - save_started

        # Broadcast processing status
        await broadcast_status("processing")

        # Step 3: Run STT first, then pass transcript into text-first emotion detection.
        parallel_started = time.perf_counter()
        transcript_result = await stt_engine.transcribe(normalized_path)
        transcript = transcript_result.get("text", "")
        emotion_result = await asyncio.to_thread(
            emotion_detector.detect_emotion,
            normalized_path,
            transcript,
        )
        t2 = time.perf_counter() - parallel_started

        language = transcript_result.get("language", "unknown")
        duration = transcript_result.get("duration", 0.0)

        parsed_intent = await intent_parser.check_intent(transcript)
        logger.info(f"Transcript: {transcript}, Intent detected: {parsed_intent}")

        intent_type = parsed_intent.get("intent_type", "conversation") if parsed_intent else "conversation"
        has_intent = parsed_intent.get("has_intent", False) if parsed_intent else False

        # Initialize action variables for conversation path
        action_taken = "none"
        action_message = None

        if has_intent and intent_type != "conversation":
            response_data = await process_transcript(transcript, "neutral", 0.0)
            response_data["language"] = language
            response_data["audio_duration"] = duration

            await broadcast_status("speaking", {"response": response_data["response"][:50]})
            await broadcast_status("idle")
            logger.info(
                "Timing: save=%.2fs parallel=%.2fs claude=%.2fs tts=%.2fs total=%.2fs",
                t1, t2, 0.0, 0.0, time.perf_counter() - request_started
            )
            return response_data

        emotion = emotion_result.get("emotion", "neutral")
        confidence = float(emotion_result.get("confidence", 0.0))

        # Add user turn to history
        add_to_history("user", transcript, emotion)

        # Step 4: Conversation response. This is the only path that needs Claude.
        history = get_history_for_empathy()
        claude_started = time.perf_counter()
        empathetic_response = await empathy_engine.get_empathetic_response(
            emotion, confidence, transcript, history
        )
        t3 = time.perf_counter() - claude_started

        # Add assistant turn to history
        add_to_history("assistant", empathetic_response)

        # Broadcast speaking status
        await broadcast_status("speaking", {"response": empathetic_response[:50]})

        # Build response
        response_data = {
            "emotion": emotion,
            "confidence": confidence,
            "transcript": transcript,
            "language": language,
            "response": empathetic_response,
            "action_taken": action_taken,
            "action_message": action_message,
            "intent": parsed_intent,
            "audio_duration": duration
        }

        # Include all emotion scores if available (convert numpy floats to Python floats)
        if "all_scores" in emotion_result:
            response_data["all_emotion_scores"] = {
                k: float(v) for k, v in emotion_result["all_scores"].items()
            }

        # Broadcast idle status
        await broadcast_status("idle")
        logger.info(
            "Timing: save=%.2fs parallel=%.2fs claude=%.2fs tts=%.2fs total=%.2fs",
            t1, t2, t3, 0.0, time.perf_counter() - request_started
        )

        return response_data

    except Exception as e:
        logger.error(f"Error processing audio: {e}", exc_info=True)
        await broadcast_status("idle")
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        # Cleanup temp files
        if filepath and Path(filepath).exists():
            try:
                Path(filepath).unlink()
            except:
                pass
        if normalized_path and Path(normalized_path).exists() and normalized_path != filepath:
            try:
                Path(normalized_path).unlink()
            except:
                pass


@app.get("/api/history")
async def get_history():
    """Get conversation history."""
    return {"history": conversation_history}


@app.post("/api/chat")
async def chat_text(request: dict):
    """Handle typed chat input through the same empathy and action pipeline."""
    transcript = request.get("text", "")
    emotion = request.get("emotion", "neutral") or "neutral"
    confidence = float(request.get("confidence", 0.0) or 0.0)

    await broadcast_status("processing")
    response_data = await process_transcript(transcript, emotion, confidence)
    await broadcast_status("speaking", {"response": response_data["response"][:50]})
    await broadcast_status("idle")
    return response_data


@app.post("/api/clear-history")
async def clear_history():
    """Clear conversation history."""
    global conversation_history
    conversation_history = []
    return {"status": "cleared"}


@app.get("/api/tts-cache")
async def get_tts_cache_info():
    """Get TTS cache information."""
    return tts_engine.get_cache_info()


@app.post("/api/tts-clear-cache")
async def clear_tts_cache():
    """Clear TTS cache."""
    tts_engine._clear_cache()
    return {"status": "cleared"}


# =============================================================================
# TTS Endpoint
# =============================================================================

@app.post("/api/speak")
async def speak_text(request: dict):
    """
    Convert text to speech using TTS engine.

    Request body:
        {
            "text": "Hello there!",
            "emotion": "happy"  // optional, defaults to neutral
        }

    Returns:
        Audio bytes (mp3 for ElevenLabs, wav for pyttsx3 fallback)

    Frontend usage:
        const response = await fetch('/api/speak', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({text: "Hello", emotion: "happy"})
        });
        const blob = await response.blob();
        const audio = new Audio(URL.createObjectURL(blob));
        audio.play();
    """
    try:
        tts_started = time.perf_counter()
        text = request.get("text", "")
        emotion = request.get("emotion", "neutral")

        if not text:
            raise HTTPException(status_code=400, detail="Text is required")

        # Generate TTS audio
        audio_bytes = await tts_engine.speak(text, emotion)

        # Determine content type based on what was returned
        # ElevenLabs returns MP3, pyttsx3 returns WAV
        eleven_key = os.getenv("ELEVENLABS_API_KEY", "").strip()
        eleven_voice = os.getenv("ELEVENLABS_VOICE_ID", "").strip()
        has_elevenlabs = (
            eleven_key and eleven_key != "your_key_here" and
            eleven_voice and eleven_voice != "your_voice_id"
        )
        content_type = "audio/mpeg" if has_elevenlabs else "audio/wav"
        logger.info(
            "Timing: save=%.2fs parallel=%.2fs claude=%.2fs tts=%.2fs",
            0.0, 0.0, 0.0, time.perf_counter() - tts_started
        )

        return Response(content=audio_bytes, media_type=content_type)

    except Exception as e:
        logger.error(f"TTS error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# WebSocket Endpoint
# =============================================================================

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket for real-time status updates.
    Sends: listening | processing | speaking | idle
    """
    await websocket.accept()
    active_websockets.add(websocket)
    logger.info(f"WebSocket connected (total: {len(active_websockets)})")

    try:
        # Send initial status
        await websocket.send_json({
            "status": "connected",
            "message": "Connected to EMPATHIX",
            "state": "idle"
        })

        # Keep connection alive and handle incoming
        while True:
            try:
                data = await websocket.receive_text()
                message = {"status": "ack", "received": data}
                await websocket.send_json(message)
            except:
                break

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        active_websockets.discard(websocket)
        logger.info(f"WebSocket cleanup (remaining: {len(active_websockets)})")


# =============================================================================
# Main Entry
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
