"""
EMPATHIX FastAPI Backend - Complete Implementation
Voice-first empathic AI assistant with parallel processing
"""

import os
import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Set, List, Dict, Any
from dataclasses import dataclass

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

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
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
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

    try:
        # Broadcast listening status
        await broadcast_status("listening")

        # Step 1: Save + validate audio
        audio_bytes = await audio.read()
        filepath = await asyncio.to_thread(audio_processor.save_audio_file, audio_bytes)

        quality = await asyncio.to_thread(audio_processor.audio_quality_check, filepath)
        if not quality["passed"]:
            return JSONResponse(
                status_code=400,
                content={"error": quality["reason"]}
            )

        # Step 2: Normalize audio
        normalized_path = await asyncio.to_thread(audio_processor.normalize_audio, filepath)

        # Broadcast processing status
        await broadcast_status("processing")

        # Step 3: PARALLEL - emotion detection + STT
        emotion_result, transcript_result = await asyncio.gather(
            asyncio.to_thread(emotion_detector.detect_emotion, normalized_path),
            stt_engine.transcribe(normalized_path)
        )

        emotion = emotion_result.get("emotion", "neutral")
        confidence = float(emotion_result.get("confidence", 0.0))
        transcript = transcript_result.get("text", "")
        language = transcript_result.get("language", "unknown")
        duration = transcript_result.get("duration", 0.0)

        # Add user turn to history
        add_to_history("user", transcript, emotion)

        # Step 4: Get empathetic response + check intent in parallel
        history = get_history_for_empathy()

        empathy_task = empathy_engine.get_empathetic_response(
            emotion, confidence, transcript, history
        )
        intent_task = intent_parser.check_intent(transcript)

        empathetic_response, parsed_intent = await asyncio.gather(
            empathy_task,
            intent_task
        )

        logger.info(f"Transcript: {transcript}, Intent detected: {parsed_intent}")

        # Step 5: Execute action if intent found (do this in parallel with response prep)
        action_taken = "none"
        intent_type = parsed_intent.get("intent_type", "conversation") if parsed_intent else "conversation"
        has_intent = parsed_intent.get("has_intent", False) if parsed_intent else False
        
        if has_intent and intent_type != "conversation":
            # Map intent parser output to action executor input
            app_name = parsed_intent.get("app_name")
            query = parsed_intent.get("query")
            action = parsed_intent.get("action", "playpause")

            action_intent = {}
            if intent_type == "open_app" and app_name:
                action_intent = {"intent_type": f"open_{app_name}", "query": query}
            elif intent_type == "search":
                action_intent = {"intent_type": "do_search", "query": query}
            elif intent_type == "screenshot":
                action_intent = {"intent_type": "take_screenshot", "query": query}
            elif intent_type == "media":
                action_intent = {"intent_type": f"media_{action}", "query": query}
            elif intent_type == "system_time":
                action_intent = {"intent_type": "get_time", "query": query}
            elif intent_type == "system_date":
                action_intent = {"intent_type": "get_date", "query": query}
            else:
                action_intent = {"intent_type": intent_type, "query": query}

            try:
                logger.info(f"Executing action: {action_intent}")
                action_result = await action_executor.run_action(action_intent)
                logger.info(f"Action result: {action_result}")
                if action_result.get("success"):
                    action_taken = action_intent.get("intent_type", intent_type)
                    logger.info(f"Action succeeded: {action_taken}")
                else:
                    logger.warning(f"Action failed: {action_result}")
            except Exception as e:
                logger.error(f"Action execution error: {e}")

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
            "audio_duration": duration
        }

        # Include all emotion scores if available (convert numpy floats to Python floats)
        if "all_scores" in emotion_result:
            response_data["all_emotion_scores"] = {
                k: float(v) for k, v in emotion_result["all_scores"].items()
            }

        # Broadcast idle status
        await broadcast_status("idle")

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
        text = request.get("text", "")
        emotion = request.get("emotion", "neutral")

        if not text:
            raise HTTPException(status_code=400, detail="Text is required")

        # Generate TTS audio
        audio_bytes = await tts_engine.speak(text, emotion)

        # Determine content type based on what was returned
        # ElevenLabs returns MP3, pyttsx3 returns WAV
        content_type = "audio/mpeg" if os.getenv("ELEVENLABS_API_KEY") else "audio/wav"

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
