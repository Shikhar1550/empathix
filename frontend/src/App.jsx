/**
 * EMPATHIX — App.jsx
 * Main layout and state management for the voice emotion AI assistant.
 *
 * Layout:
 *   Top bar: title + status dot
 *   Center: VoiceOrb → EmotionBadge → WaveformBar → Mic button
 *   Right sidebar: TranscriptLog
 *   Bottom-left: Action chip (auto-dismiss)
 *
 * WebSocket → ws://localhost:8000/ws for real-time state updates.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import VoiceOrb from './components/VoiceOrb';
import EmotionBadge from './components/EmotionBadge';
import WaveformBar from './components/WaveformBar';
import TranscriptLog from './components/TranscriptLog';

// ─── Config ──────────────────────────────────────────────────
// Use relative URLs so Vite dev proxy handles routing to the backend.
// In production, these resolve against the same origin.
const API_URL = '';  // relative — Vite proxy forwards /api/* to localhost:8000
const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;

const EMOTION_COLORS = {
  sad:       '#4A90D9',
  happy:     '#F5C842',
  angry:     '#E8453C',
  fear:      '#9B59B6',
  fearful:   '#9B59B6',
  neutral:   '#7F8C8D',
  surprise:  '#E67E22',
  surprised: '#E67E22',
  calm:      '#22D3EE',
  excited:   '#F472B6',
  disgusted: '#4ADE80',
};

// ─── App ─────────────────────────────────────────────────────
export default function App() {
  // Core state
  const [appState, setAppState] = useState('idle');        // idle | listening | processing | speaking
  const [emotion, setEmotion] = useState('neutral');
  const [confidence, setConfidence] = useState(0);
  const [allScores, setAllScores] = useState({});
  const [messages, setMessages] = useState([]);
  const [lastAction, setLastAction] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [wsConnected, setWsConnected] = useState(false);
  const [error, setError] = useState(null);

  // Refs
  const wsRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const levelRafRef = useRef(null);
  const actionTimerRef = useRef(null);
  const spaceDownRef = useRef(false);

  // ─── Derived ───────────────────────────────────────────────
  const isListening = appState === 'listening';
  const isProcessing = appState === 'processing';
  const isSpeaking = appState === 'speaking';
  const currentColor = EMOTION_COLORS[emotion] || EMOTION_COLORS.neutral;

  const statusDotClass = error
    ? 'status-dot-error'
    : !wsConnected
    ? 'status-dot-error'
    : isProcessing || isSpeaking
    ? 'status-dot-processing'
    : 'status-dot-ready';

  const statusText = error
    ? 'Error'
    : !wsConnected
    ? 'Reconnecting…'
    : isProcessing
    ? 'Processing…'
    : 'Connected';

  const stateDisplayText = {
    idle: 'TAP TO SPEAK',
    listening: 'LISTENING…',
    processing: 'ANALYZING…',
    speaking: 'RESPONDING…',
  }[appState] || 'TAP TO SPEAK';

  // ─── WebSocket ─────────────────────────────────────────────
  const connectWebSocket = useCallback(() => {
    try {
      const ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        setWsConnected(true);
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.status === 'listening') setAppState('listening');
          else if (data.status === 'processing') setAppState('processing');
          else if (data.status === 'speaking') setAppState('speaking');
          else if (data.status === 'idle') setAppState('idle');
          else if (data.status === 'error') {
            setAppState('idle');
            setError(data.message || 'Server error');
          }
        } catch { /* ignore parse errors */ }
      };

      ws.onerror = () => setWsConnected(false);

      ws.onclose = () => {
        setWsConnected(false);
        // Reconnect after 2s
        setTimeout(connectWebSocket, 2000);
      };

      wsRef.current = ws;
    } catch {
      setWsConnected(false);
    }
  }, []);

  useEffect(() => {
    connectWebSocket();
    return () => wsRef.current?.close();
  }, [connectWebSocket]);

  // ─── Audio level meter ─────────────────────────────────────
  const startLevelMeter = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const sum = data.reduce((a, b) => a + b, 0);
      const avg = sum / data.length / 255;
      setAudioLevel(avg);
      levelRafRef.current = requestAnimationFrame(tick);
    };

    tick();
  }, []);

  const stopLevelMeter = useCallback(() => {
    if (levelRafRef.current) {
      cancelAnimationFrame(levelRafRef.current);
      levelRafRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  // ─── Recording ─────────────────────────────────────────────
  // Auto-stop refs
  const silenceTimeoutRef = useRef(null);
  const maxDurationTimeoutRef = useRef(null);
  const isRecordingRef = useRef(false);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      audioChunksRef.current = [];
      isRecordingRef.current = true;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // Audio context for level metering + silence detection
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyserRef.current = analyser;

      // MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        sendAudio(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(100);

      setAppState('listening');
      startLevelMeter();

      // Start silence detection
      startSilenceDetection();

      // Max duration: auto-stop after 10 seconds
      maxDurationTimeoutRef.current = setTimeout(() => {
        if (isRecordingRef.current) {
          stopRecording();
        }
      }, 10000);
    } catch (err) {
      setError('Microphone access denied');
      console.error('[App] Mic error:', err);
    }
  }, [startLevelMeter]);

  // Silence detection - auto stop after 1.5s of silence
  const startSilenceDetection = () => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const data = new Uint8Array(analyser.frequencyBinCount);
    let silenceStart = null;

    const checkSilence = () => {
      if (!isRecordingRef.current) return;

      analyser.getByteFrequencyData(data);
      const sum = data.reduce((a, b) => a + b, 0);
      const avg = sum / data.length;

      // Threshold: avg < 10 is considered silence
      if (avg < 10) {
        if (!silenceStart) {
          silenceStart = Date.now();
        } else if (Date.now() - silenceStart > 1500) {
          // 1.5 seconds of silence
          stopRecording();
          return;
        }
      } else {
        silenceStart = null;
      }

      requestAnimationFrame(checkSilence);
    };

    // Start checking after 1 second (grace period)
    setTimeout(() => {
      if (isRecordingRef.current) checkSilence();
    }, 1000);
  };

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;

    // Clear timeouts
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    if (maxDurationTimeoutRef.current) {
      clearTimeout(maxDurationTimeoutRef.current);
      maxDurationTimeoutRef.current = null;
    }

    stopLevelMeter();

    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop();
    }

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
  }, [stopLevelMeter]);

  // ─── Send audio to backend ─────────────────────────────────
  const sendAudio = async (blob) => {
    setAppState('processing');

    const formData = new FormData();
    formData.append('audio', blob, 'recording.webm');

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.detail || err.error || `Error ${res.status}`);
        setAppState('idle');
        return;
      }

      const data = await res.json();

      setEmotion(data.emotion || 'neutral');
      setConfidence(data.confidence || 0);
      setAllScores(data.all_emotion_scores || {});
      setAppState('speaking');

      // Append messages
      const newMessages = [];
      if (data.transcript) {
        newMessages.push({
          role: 'user',
          text: data.transcript,
          emotion: data.emotion,
          confidence: data.confidence,
        });
      }
      if (data.response) {
        newMessages.push({
          role: 'assistant',
          text: data.response,
        });
      }

      if (newMessages.length > 0) {
        setMessages((prev) => [...prev, ...newMessages]);
      }

      // Action chip
      if (data.action_taken && data.action_taken !== 'none') {
        showAction(data.action_taken);
      }

      // Request TTS playback
      if (data.response) {
        playTTS(data.response, data.emotion);
      }
    } catch (err) {
      setError(`Network error: ${err.message}`);
      setAppState('idle');
    }
  };

  // ─── TTS playback ──────────────────────────────────────────
  const playTTS = async (text, emotionHint) => {
    try {
      const res = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, emotion: emotionHint || 'neutral' }),
      });

      if (!res.ok) {
        setAppState('idle');
        return;
      }

      const audioBlob = await res.blob();
      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);

      audio.onended = () => {
        URL.revokeObjectURL(url);
        setAppState('idle');
      };

      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setAppState('idle');
      };

      await audio.play();
    } catch {
      setAppState('idle');
    }
  };

  // ─── Action chip ───────────────────────────────────────────
  const showAction = (action) => {
    setLastAction(action);
    if (actionTimerRef.current) clearTimeout(actionTimerRef.current);
    actionTimerRef.current = setTimeout(() => setLastAction(''), 3000);
  };

  // ─── Mic button click ──────────────────────────────────────
  const handleMicClick = () => {
    if (isListening) {
      stopRecording();
    } else if (appState === 'idle' || appState === 'speaking') {
      startRecording();
    }
  };

  // ─── Spacebar hold to record ───────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && !e.repeat && !spaceDownRef.current) {
        // Don't intercept if user is typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        spaceDownRef.current = true;
        if (!isListening && (appState === 'idle' || appState === 'speaking')) {
          startRecording();
        }
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === 'Space' && spaceDownRef.current) {
        e.preventDefault();
        spaceDownRef.current = false;
        if (isListening) {
          stopRecording();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [appState, isListening, startRecording, stopRecording]);

  // ─── Cleanup on unmount ────────────────────────────────────
  useEffect(() => {
    return () => {
      isRecordingRef.current = false;
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
      if (maxDurationTimeoutRef.current) clearTimeout(maxDurationTimeoutRef.current);
      stopLevelMeter();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
      wsRef.current?.close();
      if (actionTimerRef.current) clearTimeout(actionTimerRef.current);
    };
  }, [stopLevelMeter]);

  // ─── Ambient background color ──────────────────────────────
  const ambientColor = currentColor + '10';

  // ─── Render ────────────────────────────────────────────────
  return (
    <>
      {/* Ambient background glow */}
      <div className="empathix-bg" style={{ '--ambient-color': ambientColor }} />

      <div className="empathix-layout">
        {/* ── Main center area ── */}
        <div className="empathix-main">
          {/* Top bar */}
          <div className="empathix-top-bar">
            <div>
              <div className="empathix-title">EMPATHIX</div>
              <div className="empathix-subtitle">Voice Emotion AI</div>
            </div>
            <div className="empathix-status">
              <div className={`status-dot ${statusDotClass}`} />
              <span>{statusText}</span>
            </div>
          </div>

          {/* VoiceOrb */}
          <VoiceOrb
            emotion={emotion}
            isListening={isListening}
            isProcessing={isProcessing}
            isSpeaking={isSpeaking}
            audioLevel={audioLevel}
          />

          {/* EmotionBadge — below orb */}
          <EmotionBadge
            emotion={emotion}
            confidence={confidence}
            allScores={allScores}
          />

          {/* WaveformBar — shown when recording */}
          <div
            style={{
              width: 280,
              opacity: isListening ? 1 : 0.3,
              transition: 'opacity 0.4s ease',
            }}
          >
            <WaveformBar
              isRecording={isListening}
              audioStream={streamRef.current}
              emotionColor={currentColor}
            />
          </div>

          {/* State text */}
          <span className="state-text">{stateDisplayText}</span>

          {/* Mic button */}
          <button
            id="mic-button"
            className={`mic-btn ${isListening ? 'mic-btn-recording' : ''}`}
            onClick={handleMicClick}
            disabled={isProcessing}
            aria-label={isListening ? 'Stop recording' : 'Start recording'}
            style={{
              opacity: isProcessing ? 0.4 : 1,
              cursor: isProcessing ? 'not-allowed' : 'pointer',
            }}
          >
            <div className="mic-btn-ring" />
            {isListening ? (
              /* Stop icon */
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              /* Mic icon */
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="9" y="2" width="6" height="11" rx="3" />
                <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                <line x1="12" y1="18" x2="12" y2="22" />
                <line x1="8" y1="22" x2="16" y2="22" />
              </svg>
            )}
          </button>

          {/* Error display */}
          {error && (
            <div
              style={{
                padding: '10px 20px',
                borderRadius: 12,
                background: 'rgba(232, 69, 60, 0.1)',
                border: '1px solid rgba(232, 69, 60, 0.25)',
                color: '#E8453C',
                fontSize: 12,
                maxWidth: 360,
                textAlign: 'center',
              }}
            >
              {error}
            </div>
          )}

          {/* Action chip — bottom left */}
          {lastAction && (
            <div className="action-chip-area">
              <div className="action-chip" key={lastAction}>
                <span>✓</span>
                <span>{formatAction(lastAction)}</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Right sidebar: TranscriptLog ── */}
        <div className="empathix-sidebar">
          <TranscriptLog messages={messages} />
        </div>
      </div>
    </>
  );
}

// ─── Helpers ─────────────────────────────────────────────────

function formatAction(action) {
  // e.g. "open_spotify" → "Opened Spotify"
  const words = action.replace(/_/g, ' ').split(' ');
  const formatted = words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return formatted;
}
