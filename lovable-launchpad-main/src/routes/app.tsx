import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { Mic, MicOff, MessageSquare, ArrowLeft, X, AlertCircle } from "lucide-react";
import { AIOrb, type EmotionTone } from "@/components/AIOrb";
import { CursorGlow } from "@/components/CursorGlow";
import { toast } from "sonner";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "EMPATHIX — Live Session" },
      {
        name: "description",
        content:
          "Live EMPATHIX session. Voice emotion detection, empathetic replies, and ambient orb visualization.",
      },
      { property: "og:title", content: "EMPATHIX — Live Session" },
      {
        property: "og:description",
        content: "Talk to EMPATHIX. It hears what you feel.",
      },
    ],
  }),
  component: AppPage,
});

/* =========================================================
   BACKEND CONFIG
   ========================================================= */
const BACKEND_URL = "http://localhost:8000";
const WS_URL = "ws://localhost:8000/ws";

function mapEmotionToTone(backendEmotion: string): EmotionTone {
  const map: Record<string, EmotionTone> = {
    // Direct matches
    "sad": "sad",
    "happy": "happy",
    "angry": "angry",
    "neutral": "neutral",
    // Mapped emotions
    "fear": "anxious",
    "anxious": "anxious",
    "surprise": "happy",
    "disgust": "angry",
    "calm": "calm",
    "excited": "happy",
    "frustrated": "angry",
  };
  const tone = map[backendEmotion?.toLowerCase()];
  // If unknown emotion comes from backend → neutral, never undefined
  return tone ?? "neutral";
}

type BackendStatus = "listening" | "processing" | "speaking" | "idle";

interface AnalyzeResponse {
  emotion: string;
  confidence: number;
  transcript: string;
  response: string;
  action_taken: string;
  action_message?: string;
  language?: string;
  audio_duration?: number;
}

/* =========================================================
   SPLASH SCREEN
   ========================================================= */
function Splash({ onDone }: { onDone: () => void }) {
  const letters = "EMPATHIX".split("");
  const [fadeOut, setFadeOut] = useState(false);
  const mountedRef = useRef(true);

  const handleDone = useCallback(() => {
    if (mountedRef.current) onDone();
  }, [onDone]);

  useEffect(() => {
    mountedRef.current = true;
    const t1 = setTimeout(() => mountedRef.current && setFadeOut(true), 3500);
    const t2 = setTimeout(handleDone, 4000);
    return () => {
      mountedRef.current = false;
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [handleDone]);

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-background transition-opacity duration-500 cursor-pointer ${
        fadeOut ? "opacity-0" : "opacity-100"
      }`}
      onClick={handleDone}
      title="Click to skip"
    >
      {/* Animated grid */}
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-30 animate-grid-move" />

      {/* Layered glow halos */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-primary/40 via-accent/25 to-transparent blur-3xl animate-glow-pulse" />
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-tr from-accent/30 via-cyan/20 to-transparent blur-2xl"
        style={{ animation: "glow-pulse 2.4s ease-in-out infinite reverse" }}
      />

      {/* Pulsing concentric rings */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        {[0, 0.4, 0.8, 1.2].map((delay, i) => (
          <span
            key={i}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/40"
            style={{
              width: 120,
              height: 120,
              animation: `splash-ring 2.6s cubic-bezier(0.22,1,0.36,1) ${delay}s infinite`,
            }}
          />
        ))}
      </div>

      {/* Orbiting dots */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[260px] w-[260px] -translate-x-1/2 -translate-y-1/2 animate-orb-rotate"
        style={{ animationDuration: "6s" }}
      >
        <span className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rounded-full bg-primary shadow-[0_0_18px_var(--primary)]" />
        <span className="absolute left-1/2 bottom-0 h-2 w-2 -translate-x-1/2 rounded-full bg-accent shadow-[0_0_18px_var(--accent)]" />
        <span className="absolute top-1/2 left-0 h-2 w-2 -translate-y-1/2 rounded-full bg-cyan shadow-[0_0_18px_var(--cyan)]" />
        <span className="absolute top-1/2 right-0 h-2 w-2 -translate-y-1/2 rounded-full bg-violet shadow-[0_0_18px_var(--violet)]" />
      </div>


      {/* Wordmark with per-letter reveal */}
      <h1 className="relative font-display text-7xl font-bold tracking-[0.25em] max-md:text-4xl">
        {letters.map((ch, i) => (
          <span
            key={i}
            className="inline-block text-gradient-animated"
            style={{
              opacity: 0,
              filter: "blur(12px)",
              transform: "translateY(40px)",
              animation: `splash-letter 0.9s cubic-bezier(0.22,1,0.36,1) forwards`,
              animationDelay: `${0.2 + i * 0.09}s`,
            }}
          >
            {ch}
          </span>
        ))}
      </h1>

      {/* Underline sweep */}
      <div
        className="relative mt-4 h-[2px] w-0 bg-gradient-to-r from-transparent via-primary to-transparent"
        style={{
          animation: "splash-underline 1s cubic-bezier(0.22,1,0.36,1) 1.1s forwards",
        }}
      />

      {/* Tagline */}
      <p
        className="relative mt-6 font-mono text-sm tracking-[0.4em] text-muted-foreground"
        style={{
          opacity: 0,
          animation: `fade-up 0.9s ease-out 1.4s forwards`,
        }}
      >
        I HEAR WHAT YOU FEEL
      </p>

      {/* Boot status line */}
      <p
        className="relative mt-3 font-mono text-[10px] uppercase tracking-[0.5em] text-primary/70"
        style={{
          opacity: 0,
          animation: `fade-up 0.8s ease-out 1.9s forwards`,
        }}
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_10px_var(--primary)] animate-glow-pulse mr-2 align-middle" />
        Calibrating empathy engine
      </p>

      {/* Scan line */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent animate-scan" />
      </div>

      {/* Vignette */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_40%,var(--background)_100%)]" />
    </div>
  );
}

/* =========================================================
   CONVERSATION PANEL
   ========================================================= */
type Message = {
  id: number;
  role: "user" | "ai";
  text: string;
  emotion?: string;
  confidence?: number;
};

function Conversation({
  messages,
  onClose,
}: {
  messages: Message[];
  onClose?: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex h-full flex-col rounded-2xl glass p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <MessageSquare className="h-4 w-4 text-cyan" aria-hidden="true" />
          <span>Conversation</span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close conversation"
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-primary/10 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div
        ref={scroller}
        className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1"
        style={{ scrollbarWidth: "thin" }}
      >
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-muted-foreground text-xs">
            No messages yet. Tap the orb to start talking.
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            style={{ animation: "fade-up 0.4s ease-out forwards", opacity: 0 }}
          >
            <div
              className={`max-w-[90%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                m.role === "user"
                  ? "bg-secondary text-secondary-foreground"
                  : "bg-gradient-to-br from-primary/30 to-accent/30 text-foreground border border-primary/20"
              }`}
            >
              <p>{m.text}</p>
              {m.emotion && (
                <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                  {m.emotion} · {m.confidence}%
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* =========================================================
   REACTIVE WAVEFORM
   ========================================================= */
function ReactiveWaveform({ active, tone, audioLevel }: { active: boolean; tone: EmotionTone; audioLevel?: number }) {
  const bars = 56;
  const colorMap: Record<EmotionTone, string> = {
    neutral: "from-primary to-accent",
    sad: "from-[oklch(0.5_0.18_270)] to-[oklch(0.7_0.22_300)]",
    happy: "from-[oklch(0.85_0.2_70)] to-[oklch(0.78_0.22_40)]",
    angry: "from-[oklch(0.65_0.27_25)] to-[oklch(0.55_0.27_20)]",
    calm: "from-[oklch(0.8_0.18_180)] to-[oklch(0.7_0.18_200)]",
    anxious: "from-[oklch(0.78_0.24_310)] to-[oklch(0.55_0.25_300)]",
  };

  const level = audioLevel ?? 0;

  return (
    <div className="flex h-16 items-center justify-center gap-[3px]">
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className={`w-[3px] rounded-full bg-gradient-to-t ${colorMap[tone]} transition-colors duration-500`}
          style={{
            height: active ? `${14 + Math.sin(i * 0.6) * 22 + 22 + level * 14}px` : `4px`,
            animation: active ? `wave 1.2s ease-in-out infinite` : "none",
            animationDelay: `${i * 0.04}s`,
            animationDuration: `${0.6 + (i % 5) * 0.15}s`,
            transition: "height 0.15s ease",
          }}
        />
      ))}
    </div>
  );
}

/* =========================================================
   MAIN APP PAGE
   ========================================================= */
const TONE_LABELS: Record<EmotionTone, string> = {
  neutral: "Neutral",
  sad: "Sad",
  happy: "Happy",
  angry: "Angry",
  calm: "Calm",
  anxious: "Anxious",
};
const TONE_CYCLE: EmotionTone[] = ["neutral", "happy", "calm", "anxious", "sad", "angry"];
const SILENCE_RMS_THRESHOLD = 0.008;
const SILENCE_STOP_MS = 2500;
const MAX_RECORDING_MS = 25000;

function AppPage() {
  const [showSplash, setShowSplash] = useState(true);
  const [listening, setListening] = useState(false);
  const [tone, setTone] = useState<EmotionTone>("neutral");
  const [intensity, setIntensity] = useState(1);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("idle");
  const [wsConnected, setWsConnected] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  // Refs for recording and WebSocket
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const shouldReconnectRef = useRef(true);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const silenceFrameRef = useRef<number | null>(null);
  const silenceDelayTimeoutRef = useRef<number | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const recordingStartTimeRef = useRef<number>(0);
  const maxDurationTimeoutRef = useRef<number | null>(null);
  const isRecordingRef = useRef(false);
  const isStoppingRef = useRef(false);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const messageIdCounter = useRef(1);

  // Format emotion label for display
  const formatEmotionLabel = useCallback((emotion: string): string => {
    const tone = mapEmotionToTone(emotion);
    return TONE_LABELS[tone];
  }, []);

  // Tone cycling during listening only
  useEffect(() => {
    if (backendStatus !== "listening") return;

    let i = 0;
    setTone(TONE_CYCLE[0]);
    setIntensity(1.1);
    const id = setInterval(() => {
      i = (i + 1) % TONE_CYCLE.length;
      setTone(TONE_CYCLE[i]);
      setIntensity(1 + Math.sin(i * 0.9) * 0.25);
    }, 3000);
    return () => clearInterval(id);
  }, [backendStatus]);

  /* =========================================================
     WEBSOCKET CONNECTION
     ========================================================= */
  const isConnectingRef = useRef(false);

  const connectWebSocket = useCallback(() => {
    if (!shouldReconnectRef.current) return;
    if (isConnectingRef.current) return; // Prevent duplicate connections (React Strict Mode)
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    isConnectingRef.current = true;

    try {
      const socket = new WebSocket(WS_URL);

      socket.onopen = () => {
        isConnectingRef.current = false;
        setWsConnected(true);
        console.log("[WebSocket] Connected");
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Only apply valid status updates. The backend also sends "connected" and "ack".
          if (data.status === "listening") setBackendStatus("listening");
          else if (data.status === "processing") setBackendStatus("processing");
          else if (data.status === "speaking") setBackendStatus("speaking");
          else if (data.status === "idle" || data.state === "idle") setBackendStatus("idle");
        } catch {
          // Ignore malformed messages
        }
      };

      socket.onerror = () => {
        isConnectingRef.current = false;
        setWsConnected(false);
      };

      socket.onclose = () => {
        isConnectingRef.current = false;
        setWsConnected(false);
        if (!shouldReconnectRef.current) return;
        // Reconnect after 2 seconds
        reconnectTimeoutRef.current = window.setTimeout(() => {
          connectWebSocket();
        }, 2000);
      };

      wsRef.current = socket;
    } catch (err) {
      isConnectingRef.current = false;
      console.error("[WebSocket] Connection error:", err);
      setWsConnected(false);
    }
  }, []);

  useEffect(() => {
    shouldReconnectRef.current = true;
    connectWebSocket();

    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, [connectWebSocket]);

  /* =========================================================
     TTS PLAYBACK
     ========================================================= */
  const playTTS = useCallback(async (text: string, emotionHint: string) => {
    const fallbackSpeak = () => {
      if (!("speechSynthesis" in window)) {
        toast.error("Voice playback is unavailable on this browser.");
        setBackendStatus("idle");
        return;
      }

      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate =
        emotionHint === "happy" ? 1.03 : emotionHint === "sad" || emotionHint === "calm" ? 0.93 : 0.98;
      utterance.pitch = emotionHint === "happy" ? 0.92 : 0.8;
      utterance.volume = 1;

      const voices = window.speechSynthesis.getVoices();
      const preferredVoice =
        voices.find((voice) => /david|mark|male/i.test(voice.name)) ??
        voices.find((voice) => /en-in|en-gb|en-us/i.test(voice.lang)) ??
        voices[0];

      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      setBackendStatus("speaking");

      utterance.onend = () => {
        setBackendStatus("idle");
      };

      utterance.onerror = () => {
        toast.error("Jarvis voice could not play.");
        setBackendStatus("idle");
      };

      window.speechSynthesis.speak(utterance);
    };

    try {
      const response = await fetch(`${BACKEND_URL}/api/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, emotion: emotionHint }),
      });

      if (!response.ok) {
        fallbackSpeak();
        return;
      }

      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
        ttsAudioRef.current = null;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      ttsAudioRef.current = audio;

      setBackendStatus("speaking");

      audio.onended = () => {
        if (ttsAudioRef.current === audio) {
          ttsAudioRef.current = null;
        }
        URL.revokeObjectURL(url);
        setBackendStatus("idle");
      };

      audio.onerror = () => {
        if (ttsAudioRef.current === audio) {
          ttsAudioRef.current = null;
        }
        URL.revokeObjectURL(url);
        fallbackSpeak();
      };

      await audio.play().catch(() => {
        if (ttsAudioRef.current === audio) {
          ttsAudioRef.current = null;
        }
        URL.revokeObjectURL(url);
        fallbackSpeak();
      });
    } catch (err) {
      console.error("[TTS] Error:", err);
      fallbackSpeak();
    }
  }, []);

  /* =========================================================
     HANDLE BACKEND RESPONSE
     ========================================================= */
  const handleAnalyzeResponse = useCallback((data: AnalyzeResponse) => {
    const mappedTone = mapEmotionToTone(data.emotion);
    const confidencePercent = Math.round((data.confidence || 0) * 100);

    setTone(mappedTone);
    setIntensity(0.5 + (data.confidence || 0.5) * 2);
    setBackendStatus("speaking");

    // Add messages
    const newMessages: Message[] = [];

    if (data.transcript) {
      newMessages.push({
        id: messageIdCounter.current++,
        role: "user",
        text: data.transcript,
        emotion: formatEmotionLabel(data.emotion),
        confidence: confidencePercent,
      });
    }

    if (data.response) {
      newMessages.push({
        id: messageIdCounter.current++,
        role: "ai",
        text: data.response,
      });
    }

    if (newMessages.length > 0) {
      setMessages((prev) => [...prev, ...newMessages]);
      setChatOpen(true);
    }

    // Show action toast if action was taken
    if (data.action_taken && data.action_taken !== "none") {
      const actionText = data.action_message || `${data.action_taken.replace(/_/g, " ")}`;
      toast.info(actionText, {
        icon: "⚡",
        duration: 3000,
      });
    }

    // Play TTS
    if (data.response) {
      playTTS(data.response, data.emotion);
    } else {
      setBackendStatus("idle");
    }
  }, [formatEmotionLabel, playTTS]);

  /* =========================================================
     AUDIO LEVEL METER
     ========================================================= */
  const stopLevelMeter = useCallback(() => {
    if (meterFrameRef.current) {
      cancelAnimationFrame(meterFrameRef.current);
      meterFrameRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  const startLevelMeter = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const data = new Float32Array(analyser.fftSize);

    const tick = () => {
      if (!analyserRef.current) return;
      analyser.getFloatTimeDomainData(data);
      let sumSquares = 0;
      for (let i = 0; i < data.length; i++) {
        sumSquares += data[i] * data[i];
      }
      const rms = Math.sqrt(sumSquares / data.length);
      const level = Math.min(1, rms * 18);
      setAudioLevel(level);
      meterFrameRef.current = requestAnimationFrame(tick);
    };

    tick();
  }, []);

  /* =========================================================
     SILENCE DETECTION
     ========================================================= */
  const stopRecording = useCallback(() => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;
    isRecordingRef.current = false;

    if (maxDurationTimeoutRef.current) {
      window.clearTimeout(maxDurationTimeoutRef.current);
      maxDurationTimeoutRef.current = null;
    }

    stopLevelMeter();

    if (silenceFrameRef.current) {
      cancelAnimationFrame(silenceFrameRef.current);
      silenceFrameRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.requestData();
      } catch {
        // Ignore
      }
      recorder.stop();
      return;
    }

    cleanupRecording();
  }, [stopLevelMeter]);

  const cleanupRecording = useCallback(() => {
    if (silenceFrameRef.current) {
      cancelAnimationFrame(silenceFrameRef.current);
      silenceFrameRef.current = null;
    }

    if (silenceDelayTimeoutRef.current) {
      window.clearTimeout(silenceDelayTimeoutRef.current);
      silenceDelayTimeoutRef.current = null;
    }

    if (maxDurationTimeoutRef.current) {
      window.clearTimeout(maxDurationTimeoutRef.current);
      maxDurationTimeoutRef.current = null;
    }

    silenceStartRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
    }

    audioCtxRef.current = null;
    analyserRef.current = null;
    mediaRecorderRef.current = null;
    isStoppingRef.current = false;
    setListening(false);
    setAudioLevel(0);
  }, []);

  const startSilenceDetection = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const data = new Float32Array(analyser.fftSize);
    silenceStartRef.current = null;

    const checkSilence = () => {
      if (!isRecordingRef.current || !analyserRef.current) return;

      analyser.getFloatTimeDomainData(data);
      let sumSquares = 0;
      for (let i = 0; i < data.length; i++) {
        sumSquares += data[i] * data[i];
      }
      const rms = Math.sqrt(sumSquares / data.length);
      const now = Date.now();

      if (rms < SILENCE_RMS_THRESHOLD) {
        if (!silenceStartRef.current) {
          silenceStartRef.current = now;
        } else if (now - silenceStartRef.current >= SILENCE_STOP_MS) {
          stopRecording();
          return;
        }
      } else {
        silenceStartRef.current = null;
      }

      silenceFrameRef.current = requestAnimationFrame(checkSilence);
    };

    // Give the recorder a brief warmup before evaluating silence.
    silenceDelayTimeoutRef.current = window.setTimeout(() => {
      silenceDelayTimeoutRef.current = null;
      if (isRecordingRef.current) checkSilence();
    }, 300);
  }, [stopRecording]);

  /* =========================================================
     SEND AUDIO TO BACKEND
     ========================================================= */
  const sendAudio = useCallback(async (blob: Blob) => {
    setBackendStatus("processing");
    const formData = new FormData();
    const extension = blob.type.includes("mp4") ? "mp4" : "webm";
    formData.append("audio", blob, `recording.${extension}`);

    try {
      const response = await fetch(`${BACKEND_URL}/api/analyze`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}) as { error?: string; detail?: string });
        toast.error(payload.error || payload.detail || `Request failed: ${response.status}`);
        setBackendStatus("idle");
        return;
      }

      const data = await response.json() as AnalyzeResponse;
      handleAnalyzeResponse(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      toast.error(`Backend offline — ${msg}`);
      setBackendStatus("idle");
    }
  }, [handleAnalyzeResponse]);

  /* =========================================================
     START RECORDING
     ========================================================= */
  const startRecording = useCallback(async () => {
    console.log("[Recording] Starting...");
    try {
      isRecordingRef.current = true;
      isStoppingRef.current = false;
      audioChunksRef.current = [];
      setChatOpen(false);

      console.log("[Recording] Requesting mic permission...");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      console.log("[Recording] Mic access granted");

      streamRef.current = stream;
      console.log("[Recording] Stream obtained");

      // Set up audio context for analysis
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const context = new AudioContextClass();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.85;
      source.connect(analyser);
      audioCtxRef.current = context;
      analyserRef.current = analyser;
      console.log("[Recording] Audio context setup complete");

      // Determine MIME type
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";
      console.log("[Recording] Using MIME type:", mimeType);

      const recorder = new MediaRecorder(stream, { mimeType });

      recorder.ondataavailable = (event) => {
        console.log("[Recording] Data available:", event.data.size, "bytes");
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        console.log("[Recording] Stopped, creating blob...");
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        cleanupRecording();

        if (blob.size < 1200) {
          console.log("[Recording] Blob too small:", blob.size);
          setBackendStatus("idle");
          toast.error("I heard too little audio. Please try again.");
          return;
        }

        console.log("[Recording] Sending audio:", blob.size, "bytes");
        sendAudio(blob);
      };

      mediaRecorderRef.current = recorder;
      recordingStartTimeRef.current = Date.now();

      recorder.start();
      console.log("[Recording] MediaRecorder started");
      setListening(true);
      setBackendStatus("listening");
      startLevelMeter();
      startSilenceDetection();

      // Safety cap only. Normal stopping happens via silence detection.
      maxDurationTimeoutRef.current = window.setTimeout(() => {
        if (isRecordingRef.current) {
          console.log("[Recording] Max duration reached");
          stopRecording();
        }
      }, MAX_RECORDING_MS);
      console.log("[Recording] Setup complete!");
    } catch (err) {
      console.error("[Recording] Error:", err);
      toast.error("Microphone access required — " + (err instanceof Error ? err.message : "check permissions"));
      setBackendStatus("idle");
    }
  }, [cleanupRecording, sendAudio, startLevelMeter, startSilenceDetection, stopRecording]);

  /* =========================================================
     TOGGLE LISTENING
     ========================================================= */
  const toggleListening = useCallback(() => {
    if (listening) {
      stopRecording();
    } else if (backendStatus === "idle" || backendStatus === "speaking") {
      startRecording();
    }
  }, [listening, backendStatus, startRecording, stopRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      if (maxDurationTimeoutRef.current) {
        window.clearTimeout(maxDurationTimeoutRef.current);
      }
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
        ttsAudioRef.current = null;
      }
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      stopLevelMeter();
      cleanupRecording();
      wsRef.current?.close();
    };
  }, [cleanupRecording, stopLevelMeter]);

  // Close chat drawer on Escape
  useEffect(() => {
    if (!chatOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setChatOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chatOpen]);

  // Status text
  const getStatusText = (): string => {
    switch (backendStatus) {
      case "listening": return "Listening";
      case "processing": return "Analyzing";
      case "speaking": return "Responding";
      default: return wsConnected ? "Tap to speak" : "Connecting...";
    }
  };

  // Dynamic intensity based on audio level when listening
  const orbIntensity = listening ? 0.95 + audioLevel * 0.8 : intensity;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      {showSplash && <Splash onDone={() => setShowSplash(false)} />}

      <CursorGlow />

      {/* Ambient backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-20" />
      <div className="pointer-events-none absolute -left-40 top-40 h-[500px] w-[500px] rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 bottom-20 h-[500px] w-[500px] rounded-full bg-accent/10 blur-3xl" />

      {/* Top bar */}
      <header className="relative z-30 flex items-center justify-between px-6 py-4 max-md:px-3">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-xl glass px-3 py-2 text-xs text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Link>

        {/* Centered brand (absolute so it's perfectly centered regardless of side widths) */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="pointer-events-auto flex items-center gap-2.5 rounded-2xl glass px-4 py-2">
            <div className="relative h-6 w-6">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary to-accent animate-glow-pulse" />
              <div className="absolute inset-1 rounded-full bg-background" />
              <div className="absolute inset-2 rounded-full bg-gradient-to-br from-primary to-accent" />
            </div>
            <span className="font-display text-sm font-bold tracking-[0.2em] text-gradient-animated">
              EMPATHIX
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Status indicator */}
          <div className="inline-flex items-center gap-2 rounded-xl glass px-3 py-2 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground whitespace-nowrap">
            <span
              className="h-1.5 w-1.5 rounded-full transition-colors duration-700"
              style={{
                background:
                  backendStatus === "listening"
                    ? "oklch(0.65 0.25 25)"
                    : backendStatus === "processing"
                      ? "oklch(0.78 0.18 220)"
                      : backendStatus === "speaking"
                        ? "oklch(0.7 0.22 300)"
                        : wsConnected
                          ? "oklch(0.8 0.18 180)"
                          : "oklch(0.5 0.05 250)",
                boxShadow: "0 0 12px currentColor",
              }}
            />
            <span className="max-sm:hidden">
              {wsConnected ? getStatusText() : "Offline"}
            </span>
          </div>

          {/* Conversation toggle */}
          <button
            type="button"
            onClick={() => setChatOpen((v) => !v)}
            aria-label={chatOpen ? "Close conversation" : "Open conversation"}
            aria-expanded={chatOpen}
            className="group relative inline-flex items-center gap-2 rounded-xl glass px-3 py-2 text-xs text-muted-foreground transition-all hover:text-foreground hover:bg-primary/10 cursor-pointer"
          >
            <MessageSquare className="h-4 w-4 text-cyan transition-transform group-hover:scale-110" />
            <span className="max-sm:hidden">Chat</span>
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-gradient-to-br from-primary to-accent shadow-[0_0_8px_var(--primary)] animate-glow-pulse" />
          </button>
        </div>
      </header>

      {/* Main: orb shifts left when chat is open */}
      <main
        className={`relative z-10 flex h-[calc(100vh-72px)] items-center justify-center px-6 pb-6 max-md:px-3 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          chatOpen ? "md:-translate-x-[200px]" : "translate-x-0"
        }`}
      >
        <section className="relative flex flex-col items-center justify-center gap-5">

          <button
            type="button"
            onClick={toggleListening}
            aria-label={listening ? "Stop recording" : "Start recording"}
            aria-pressed={listening}
            disabled={!wsConnected || backendStatus === "processing" || backendStatus === "speaking"}
            className="group relative flex items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-4 focus-visible:ring-offset-background transition-transform duration-300 hover:scale-[1.02] active:scale-[0.99] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {/* Responsive orb size */}
            <div className="max-md:hidden">
              <AIOrb size={620} tone={tone} intensity={orbIntensity} />
            </div>
            <div className="hidden max-md:block">
              <AIOrb size={340} tone={tone} intensity={orbIntensity} />
            </div>

            {/* Center mic indicator */}
            <span
              className={`pointer-events-none absolute grid place-items-center rounded-full backdrop-blur-md transition-all duration-300 ${
                listening
                  ? "h-16 w-16 bg-destructive/30 border border-destructive/60 shadow-[0_0_60px_oklch(0.65_0.25_25/0.7)]"
                  : "h-14 w-14 bg-background/30 border border-white/20 opacity-0 group-hover:opacity-100"
              }`}
            >
              {listening ? (
                <MicOff className="h-6 w-6 text-primary-foreground" />
              ) : (
                <Mic className="h-6 w-6 text-primary-foreground" />
              )}
              {listening && (
                <span className="absolute inset-0 rounded-full border-2 border-destructive/50 animate-ping" />
              )}
            </span>
          </button>

          <div className="rounded-2xl glass px-6 py-3">
            <ReactiveWaveform active={listening} tone={tone} audioLevel={audioLevel} />
          </div>

          {/* Status pill */}
          <div className="inline-flex items-center gap-2 rounded-full glass px-4 py-2 text-xs text-muted-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${
              backendStatus === "listening" ? "bg-destructive animate-pulse" :
              backendStatus === "processing" ? "bg-primary animate-pulse" :
              backendStatus === "speaking" ? "bg-accent animate-pulse" :
              wsConnected ? "bg-emerald-500" : "bg-gray-500"
            }`} />
            <span>{getStatusText()}</span>
            {!wsConnected && (
              <AlertCircle className="h-3 w-3 text-destructive" />
            )}
          </div>

        </section>
      </main>

      {/* Conversation Drawer — click-catcher (no dim, matches reference) */}
      <div
        onClick={() => setChatOpen(false)}
        aria-hidden
        className={`fixed inset-0 z-40 transition-opacity duration-300 ${
          chatOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      {/* Conversation Drawer — panel */}
      <aside
        role="dialog"
        aria-label="Conversation"
        aria-hidden={!chatOpen}
        className={`fixed right-3 top-20 bottom-3 z-50 w-[380px] max-w-[calc(100vw-1.5rem)] origin-top-right transform transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          chatOpen
            ? "translate-x-0 opacity-100 scale-100"
            : "translate-x-[110%] opacity-0 scale-95 pointer-events-none"
        }`}
      >
        <Conversation messages={messages} onClose={() => setChatOpen(false)} />
      </aside>

    </div>
  );
}
