import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Brain,
  Cpu,
  Heart,
  MessageSquare,
  Mic,
  MicOff,
  Sparkles,
  Terminal,
  Volume2,
  Waves,
  X,
  Zap,
} from 'lucide-react';
import AIOrb from './components/AIOrb';
import ActionToast from './components/ActionToast';
import CursorGlow from './components/CursorGlow';
import MagneticButton from './components/MagneticButton';
import Navbar from './components/Navbar';
import Reveal from './components/Reveal';
import ScrollProgress from './components/ScrollProgress';
import TiltCard from './components/TiltCard';
import Waveform from './components/Waveform';
import { useScrollY } from './hooks/useReveal';

const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;

const EMOTION_TO_TONE = {
  neutral: 'neutral',
  sad: 'sad',
  happy: 'happy',
  angry: 'angry',
  fear: 'anxious',
  fearful: 'anxious',
  calm: 'calm',
  surprise: 'happy',
  surprised: 'happy',
  disgusted: 'angry',
  excited: 'happy',
};

const DEMOS = {
  sad: {
    emotion: 'sad',
    confidence: 0.87,
    transcript: 'Ugh, today was a disaster...',
    response: 'I hear it in your voice. Want me to put on something calming and dim the lights?',
  },
  happy: {
    emotion: 'happy',
    confidence: 0.91,
    transcript: "I'm feeling amazing today. Open Spotify.",
    response: 'Your energy is bright right now. Opening Spotify for you.',
    action_taken: 'open_spotify',
  },
  angry: {
    emotion: 'angry',
    confidence: 0.8,
    transcript: 'This is so frustrating. Nothing is working.',
    response: "I hear the tension in that. Let's slow it down and tackle one piece at a time.",
  },
  fear: {
    emotion: 'fear',
    confidence: 0.84,
    transcript: "I'm scared I won't finish this in time.",
    response: "You're not alone in it. Let's reduce the pile and pick the very next move.",
  },
};

export default function App() {
  const [screen, setScreen] = useState('landing');
  const [showSplash, setShowSplash] = useState(false);
  const [appState, setAppState] = useState('idle');
  const [emotion, setEmotion] = useState('neutral');
  const [messages, setMessages] = useState([
    { id: 1, role: 'user', text: 'Ugh, today was a disaster...', emotion: 'Sad', confidence: 87 },
    { id: 2, role: 'ai', text: 'I hear it in your voice. Want me to put on something calming and dim the lights?' },
    { id: 3, role: 'user', text: 'Yeah. And open Spotify.', emotion: 'Calm', confidence: 64 },
    { id: 4, role: 'ai', text: "Done. Playing your 'Soft Evenings' playlist now. I'm here if you need to talk." },
  ]);
  const [actionToasts, setActionToasts] = useState([]);
  const [audioLevel, setAudioLevel] = useState(0);
  const [wsConnected, setWsConnected] = useState(false);
  const [error, setError] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const shouldReconnectRef = useRef(true);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingMimeTypeRef = useRef('audio/webm');
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const meterFrameRef = useRef(0);
  const silenceFrameRef = useRef(0);
  const maxDurationTimeoutRef = useRef(null);
  const isRecordingRef = useRef(false);
  const isStoppingRef = useRef(false);
  const speakingTimerRef = useRef(null);
  const splashTimerRef = useRef(null);
  const spaceDownRef = useRef(false);
  const ttsAudioRef = useRef(null);

  const tone = EMOTION_TO_TONE[emotion] || 'neutral';
  const intensity = appState === 'listening' ? Math.max(0.8, 0.8 + audioLevel * 1.2) : 1;
  const isListening = appState === 'listening';
  const hideSplash = useCallback(() => setShowSplash(false), []);

  useEffect(() => {
    shouldReconnectRef.current = true;

    const connect = () => {
      if (!shouldReconnectRef.current) return;

      try {
        const socket = new WebSocket(WS_URL);

        socket.onopen = () => {
          setWsConnected(true);
          setError('');
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.status === 'listening') setAppState('listening');
            else if (data.status === 'processing') setAppState('processing');
            else if (data.status === 'speaking') setAppState('speaking');
            else if (data.status === 'idle') setAppState('idle');
          } catch {
            // Ignore malformed messages.
          }
        };

        socket.onerror = () => setWsConnected(false);
        socket.onclose = () => {
          setWsConnected(false);
          if (!shouldReconnectRef.current) return;
          reconnectTimeoutRef.current = window.setTimeout(connect, 2000);
        };

        wsRef.current = socket;
      } catch {
        setWsConnected(false);
      }
    };

    connect();

    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimeoutRef.current) window.clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
    };
  }, []);

  const stopLevelMeter = useCallback(() => {
    if (meterFrameRef.current) cancelAnimationFrame(meterFrameRef.current);
    meterFrameRef.current = 0;
    setAudioLevel(0);
  }, []);

  const cleanupRecordingResources = useCallback(() => {
    if (silenceFrameRef.current) cancelAnimationFrame(silenceFrameRef.current);
    silenceFrameRef.current = 0;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
    }

    audioCtxRef.current = null;
    analyserRef.current = null;
    mediaRecorderRef.current = null;
    isStoppingRef.current = false;
  }, []);

  const startLevelMeter = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      if (!analyserRef.current) return;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let index = 0; index < data.length; index += 1) {
        sum += Math.abs(data[index] - 128);
      }
      setAudioLevel(Math.min(1, sum / data.length / 26));
      meterFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const stopRecording = useCallback(() => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;
    isRecordingRef.current = false;

    if (maxDurationTimeoutRef.current) {
      window.clearTimeout(maxDurationTimeoutRef.current);
      maxDurationTimeoutRef.current = null;
    }

    stopLevelMeter();

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.requestData();
      } catch {
        // Ignore stop-time requestData errors.
      }
      recorder.stop();
      return;
    }

    cleanupRecordingResources();
  }, [cleanupRecordingResources, stopLevelMeter]);

  const startSilenceDetection = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const data = new Uint8Array(analyser.frequencyBinCount);
    const recordingStartedAt = Date.now();
    let silenceStart = null;

    const checkSilence = () => {
      if (!isRecordingRef.current) return;

      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let index = 0; index < data.length; index += 1) {
        sum += data[index];
      }

      const average = sum / data.length;

      if (average < 6) {
        if (!silenceStart) silenceStart = Date.now();
        else if (Date.now() - recordingStartedAt > 1800 && Date.now() - silenceStart > 2300) {
          stopRecording();
          return;
        }
      } else {
        silenceStart = null;
      }

      silenceFrameRef.current = requestAnimationFrame(checkSilence);
    };

    window.setTimeout(() => {
      if (isRecordingRef.current) checkSilence();
    }, 1400);
  }, [stopRecording]);

  const playTTS = useCallback(async (text, emotionHint) => {
    const fallbackSpeak = () => {
      if (!('speechSynthesis' in window)) {
        setAppState('idle');
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = emotionHint === 'happy' ? 1.02 : emotionHint === 'sad' || emotionHint === 'calm' ? 0.92 : 0.98;
      utterance.pitch = emotionHint === 'happy' ? 0.94 : 0.82;
      utterance.volume = 1;
      utterance.onend = () => setAppState('idle');
      utterance.onerror = () => setAppState('idle');
      window.speechSynthesis.speak(utterance);
    };

    try {
      const response = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, emotion: emotionHint || 'neutral' }),
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
      audio.onended = () => {
        if (ttsAudioRef.current === audio) ttsAudioRef.current = null;
        URL.revokeObjectURL(url);
        setAppState('idle');
      };
      audio.onerror = () => {
        if (ttsAudioRef.current === audio) ttsAudioRef.current = null;
        URL.revokeObjectURL(url);
        fallbackSpeak();
      };
      await audio.play().catch(() => {
        URL.revokeObjectURL(url);
        if (ttsAudioRef.current === audio) ttsAudioRef.current = null;
        fallbackSpeak();
      });
    } catch {
      fallbackSpeak();
    }
  }, []);

  const showAction = useCallback((action, message) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setActionToasts((previous) => [...previous, { id, action, message: formatActionToast(action, message) }]);
    window.setTimeout(() => {
      setActionToasts((previous) => previous.filter((toast) => toast.id !== id));
    }, 3200);
  }, []);

  const applyConversationResult = useCallback((data) => {
    const rawEmotion = (data.emotion || 'neutral').toLowerCase();
    const nextEmotion = EMOTION_TO_TONE[rawEmotion] || 'neutral';
    const nextConfidence = Math.round((data.confidence || 0) * 100);

    setEmotion(nextEmotion);
    setAppState('speaking');
    setScreen('app');
    setChatOpen(true);

    const timestamp = Date.now();
    const nextMessages = [];
    if (data.transcript) {
      nextMessages.push({
        id: timestamp,
        role: 'user',
        text: data.transcript,
        emotion: nextEmotion.charAt(0).toUpperCase() + nextEmotion.slice(1),
        confidence: nextConfidence,
      });
    }
    if (data.response) {
      nextMessages.push({
        id: timestamp + 1,
        role: 'ai',
        text: data.response,
      });
    }
    if (nextMessages.length) {
      setMessages((previous) => [...previous, ...nextMessages]);
    }

    if (data.action_taken && data.action_taken !== 'none') {
      showAction(data.action_taken, data.action_message || data.response);
    }

    if (speakingTimerRef.current) window.clearTimeout(speakingTimerRef.current);
    if (data.response) {
      speakingTimerRef.current = window.setTimeout(() => playTTS(data.response, nextEmotion), 700);
    } else {
      speakingTimerRef.current = window.setTimeout(() => setAppState('idle'), 1400);
    }
  }, [playTTS, showAction]);

  const sendAudio = useCallback(async (blob) => {
    setAppState('processing');
    const formData = new FormData();
    const extension = recordingMimeTypeRef.current.includes('mp4') ? 'mp4' : 'webm';
    formData.append('audio', blob, `recording.${extension}`);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError(payload.detail || payload.error || `Request failed with ${response.status}`);
        setAppState('idle');
        return;
      }

      const data = await response.json();
      setError('');
      applyConversationResult(data);
    } catch (requestError) {
      setError(`Network error: ${requestError.message}`);
      setAppState('idle');
    }
  }, [applyConversationResult]);

  const sendChatMessage = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || isSendingChat) return;

    setIsSendingChat(true);
    setError('');
    setAppState('processing');
    setChatOpen(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, emotion }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError(payload.detail || payload.error || `Request failed with ${response.status}`);
        setAppState('idle');
        return;
      }

      const data = await response.json();
      setChatInput('');
      applyConversationResult(data);
    } catch (requestError) {
      setError(`Network error: ${requestError.message}`);
      setAppState('idle');
    } finally {
      setIsSendingChat(false);
    }
  }, [applyConversationResult, chatInput, emotion, isSendingChat]);

  const startRecording = useCallback(async () => {
    try {
      setError('');
      audioChunksRef.current = [];
      isRecordingRef.current = true;
      isStoppingRef.current = false;
      setScreen('app');
      setChatOpen(false);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      streamRef.current = stream;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const context = new AudioContextClass();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      audioCtxRef.current = context;
      analyserRef.current = analyser;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      recordingMimeTypeRef.current = mimeType;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        cleanupRecordingResources();
        if (blob.size < 1200) {
          setAppState('idle');
          setError('I heard too little audio. Please try once more.');
          return;
        }
        sendAudio(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setAppState('listening');
      startLevelMeter();
      startSilenceDetection();
      maxDurationTimeoutRef.current = window.setTimeout(() => {
        if (isRecordingRef.current) stopRecording();
      }, 10000);
    } catch (micError) {
      console.error('[App] Mic error:', micError);
      setError('Microphone access denied');
      setAppState('idle');
    }
  }, [cleanupRecordingResources, sendAudio, startLevelMeter, startSilenceDetection, stopRecording]);

  const launch = useCallback(() => {
    setScreen('app');
    setShowSplash(true);
    setChatOpen(false);
    if (splashTimerRef.current) window.clearTimeout(splashTimerRef.current);
    splashTimerRef.current = window.setTimeout(hideSplash, 4000);
  }, [hideSplash]);

  const runDemo = useCallback((key) => {
    const demo = DEMOS[key];
    if (!demo) return;
    setScreen('app');
    setShowSplash(false);
    setAppState('processing');
    setChatOpen(true);
    window.setTimeout(() => applyConversationResult(demo), 900);
  }, [applyConversationResult]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
      if (screen === 'app' && event.code === 'Space' && !event.repeat && !spaceDownRef.current) {
        event.preventDefault();
        spaceDownRef.current = true;
        if (!isListening && (appState === 'idle' || appState === 'speaking')) startRecording();
      }
      if (event.key === '1') runDemo('sad');
      if (event.key === '2') runDemo('happy');
      if (event.key === '3') runDemo('angry');
      if (event.key === '4') runDemo('fear');
    };

    const handleKeyUp = (event) => {
      if (event.code !== 'Space' || !spaceDownRef.current) return;
      event.preventDefault();
      spaceDownRef.current = false;
      if (isListening) stopRecording();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [appState, isListening, runDemo, screen, startRecording, stopRecording]);

  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) window.clearTimeout(reconnectTimeoutRef.current);
      if (speakingTimerRef.current) window.clearTimeout(speakingTimerRef.current);
      const splashTimer = splashTimerRef.current;
      if (splashTimer) window.clearTimeout(splashTimer);
      if (maxDurationTimeoutRef.current) window.clearTimeout(maxDurationTimeoutRef.current);
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
        ttsAudioRef.current = null;
      }
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      stopLevelMeter();
      cleanupRecordingResources();
    };
  }, [cleanupRecordingResources, stopLevelMeter]);

  return (
    <>
      {screen === 'landing' ? (
        <LandingPage wsConnected={wsConnected} onLaunch={launch} onDemo={runDemo} />
      ) : (
        <LivePage
          appState={appState}
          audioLevel={audioLevel}
          chatOpen={chatOpen}
          error={error}
          messages={messages}
          onBack={() => {
            setScreen('landing');
            setChatOpen(false);
            setShowSplash(false);
            setAppState('idle');
          }}
          onToggleChat={() => setChatOpen((value) => !value)}
          onToggleListening={() => {
            if (isListening) stopRecording();
            else if (appState === 'idle' || appState === 'speaking') startRecording();
          }}
          setChatOpen={setChatOpen}
          chatInput={chatInput}
          isSendingChat={isSendingChat}
          onChatInputChange={setChatInput}
          onSendChat={sendChatMessage}
          hideSplash={hideSplash}
          showSplash={showSplash}
          tone={tone}
          intensity={intensity}
        />
      )}

      <div className="toast-stack">
        {actionToasts.map((toast) => (
          <ActionToast key={toast.id} toast={toast} />
        ))}
      </div>
    </>
  );
}

function LandingPage({ wsConnected, onLaunch, onDemo }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <ScrollProgress />
      <CursorGlow />
      <BackgroundFX />
      <Navbar />
      <Hero wsConnected={wsConnected} onLaunch={onLaunch} />
      <Features />
      <FlowSection />
      <TechStack />
      <DemoSection onDemo={onDemo} />
      <CTA onLaunch={onLaunch} />
      <Footer />
    </div>
  );
}

function BackgroundFX() {
  const y = useScrollY();
  return (
    <div className="pointer-events-none fixed inset-0 z-0">
      <div className="absolute inset-0 bg-grid opacity-30 animate-grid-move" style={{ transform: `translateY(${y * 0.15}px)` }} />
      <div className="absolute left-1/2 top-0 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-primary-20 blur-120" style={{ transform: `translate(-50%, ${y * 0.3}px)` }} />
      <div className="absolute bottom-0 right-0 h-[500px] w-[500px] rounded-full bg-accent-20 blur-120" style={{ transform: `translateY(${-y * 0.2}px)` }} />
      <div className="absolute left-0 top-1/2 h-[400px] w-[400px] rounded-full bg-primary-15 blur-100" style={{ transform: `translateY(${-y * 0.15}px)` }} />
      <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
    </div>
  );
}

function Hero({ wsConnected, onLaunch }) {
  const y = useScrollY();
  return (
    <section className="hero-section">
      <div className="hero-grid">
        <div className="hero-copy">
          <Reveal variant="up" delay={0.05}>
            <div className="hero-pill">
              <span className="hero-pill-dot" />
              <span>{wsConnected ? 'Now listening · v1.0 beta' : 'Reconnecting · v1.0 beta'}</span>
            </div>
          </Reveal>

          <Reveal variant="blur" delay={0.15}>
            <h1 className="hero-title">
              Your AI that
              <br />
              <span className="text-gradient-animated">feels you.</span>
            </h1>
          </Reveal>

          <Reveal variant="up" delay={0.25}>
            <p className="hero-text">
              EMPATHIX listens to your voice, reads the emotion in your tone, and replies with the
              empathy of a real friend. A Jarvis built on emotion.
            </p>
          </Reveal>

          <Reveal variant="up" delay={0.35}>
            <div className="hero-actions">
              <MagneticButton onClick={onLaunch} className="launch-button">
                <Mic size={20} />
                Start Talking
                <ArrowRight size={16} />
              </MagneticButton>
            </div>
          </Reveal>

          <Reveal variant="up" delay={0.45}>
            <div className="hero-stats">
              {[
                { value: '12+', label: 'Emotions detected' },
                { value: '<400ms', label: 'Response latency' },
                { value: '100%', label: 'Local STT' },
              ].map((stat) => (
                <TiltCard key={stat.label} className="hero-stat-card" intensity={6}>
                  <div className="hero-stat-value text-gradient">{stat.value}</div>
                  <div className="hero-stat-label">{stat.label}</div>
                </TiltCard>
              ))}
            </div>
          </Reveal>
        </div>

        <div className="hero-visual" style={{ transform: `translateY(${-y * 0.1}px)` }}>
          <AIOrb size={640} tone="neutral" intensity={1} />
          <div className="hero-orb-scan" />
        </div>
      </div>
    </section>
  );
}

function Features() {
  const features = [
    { icon: Mic, title: 'Voice-First Input', desc: 'Whisper STT runs locally. No cloud audio leaks. Press, speak, done.' },
    { icon: Heart, title: 'Emotion from Tone', desc: 'SpeechBrain wav2vec2 reads sadness, joy, anger, calm straight from your voice.' },
    { icon: Brain, title: 'Empathetic Mind', desc: 'Claude crafts replies tuned to how you actually feel, not just what you say.' },
    { icon: Volume2, title: 'Natural Speech', desc: 'TTS speaks back with warmth and keeps the flow conversational.' },
    { icon: Terminal, title: 'OS Control', desc: 'Open Spotify, draft mail, play music. EMPATHIX runs commands on your machine.' },
    { icon: Zap, title: 'Real-time Async', desc: 'FastAPI plus asyncio keeps the pipeline quick and responsive.' },
  ];

  return (
    <section id="features" className="section">
      <div className="section-inner">
        <Reveal variant="up">
          <SectionHeader
            eyebrow="Capabilities"
            title="Built like Jarvis. Tuned like a friend."
            subtitle="Every layer of EMPATHIX is engineered for emotional fidelity and instant response."
          />
        </Reveal>

        <div className="feature-grid">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <Reveal key={feature.title} variant="up" delay={index * 0.08}>
                <TiltCard className="feature-card" intensity={10}>
                  <div className="feature-card-glow" />
                  <div className="feature-icon-box">
                    <Icon size={24} />
                  </div>
                  <h3>{feature.title}</h3>
                  <p>{feature.desc}</p>
                </TiltCard>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FlowSection() {
  const steps = [
    { icon: Mic, label: 'Mic' },
    { icon: Waves, label: 'Tone Analysis' },
    { icon: Brain, label: 'Claude Empathy' },
    { icon: Volume2, label: 'TTS Voice' },
    { icon: Terminal, label: 'Execute' },
  ];

  return (
    <section className="section">
      <div className="section-inner">
        <Reveal>
          <SectionHeader
            eyebrow="Pipeline"
            title="From breath to action in 400ms"
            subtitle="A streaming async pipeline keeps the conversation feeling alive."
          />
        </Reveal>

        <Reveal variant="scale" delay={0.1}>
          <div className="pipeline-panel border-beam">
            <div className="pipeline-row">
              {steps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <div key={step.label} className="pipeline-item">
                    <Reveal variant="scale" delay={index * 0.12}>
                      <div className="pipeline-step">
                        <div className="pipeline-step-box">
                          <Icon size={30} />
                          <div className="pipeline-step-overlay" />
                        </div>
                        <span>{step.label}</span>
                      </div>
                    </Reveal>
                    {index < steps.length - 1 ? (
                      <div className="pipeline-connector">
                        <div className="pipeline-connector-dot" />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="pipeline-wave">
              <Waveform bars={48} />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function TechStack() {
  const stack = [
    { name: 'Python', cat: 'Core' },
    { name: 'FastAPI', cat: 'Backend' },
    { name: 'asyncio', cat: 'Concurrency' },
    { name: 'SpeechBrain', cat: 'Emotion AI' },
    { name: 'wav2vec2', cat: 'Model' },
    { name: 'Whisper', cat: 'STT' },
    { name: 'Claude', cat: 'LLM' },
    { name: 'ElevenLabs', cat: 'TTS' },
    { name: 'React + Vite', cat: 'Frontend' },
    { name: 'Tailwind v4', cat: 'UI' },
    { name: 'uvicorn', cat: 'Server' },
    { name: 'WebSocket', cat: 'Realtime' },
  ];

  return (
    <section id="tech" className="section">
      <div className="section-inner">
        <Reveal>
          <SectionHeader
            eyebrow="Stack"
            title="Engineered with care"
            subtitle="Best-in-class models stitched into a real-time system."
          />
        </Reveal>

        <div className="stack-grid">
          {stack.map((item, index) => (
            <Reveal key={item.name} variant="up" delay={index * 0.04}>
              <TiltCard className="stack-card" intensity={8}>
                <Cpu size={18} />
                <div>
                  <div className="stack-cat">{item.cat}</div>
                  <div className="stack-name">{item.name}</div>
                </div>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function DemoSection({ onDemo }) {
  const [active, setActive] = useState(0);
  const conversation = [
    { who: 'you', text: 'Ugh, today was a disaster...', emotion: 'Sad · 87%' },
    { who: 'ai', text: 'I hear it in your voice. Want me to put on something calming and dim the lights?' },
    { who: 'you', text: 'Yeah. And open Spotify.', emotion: 'Calm · 64%' },
    { who: 'ai', text: "Done. Playing your 'Soft Evenings' playlist now. I'm here if you need to talk." },
  ];

  useEffect(() => {
    const id = window.setInterval(() => {
      setActive((value) => (value + 1) % conversation.length);
    }, 2500);
    return () => window.clearInterval(id);
  }, [conversation.length]);

  return (
    <section id="demo" className="section">
      <div className="section-inner">
        <Reveal>
          <SectionHeader
            eyebrow="Live Demo"
            title="See empathy in action"
            subtitle="A glimpse of a real EMPATHIX conversation."
          />
        </Reveal>

        <div className="demo-grid">
          <Reveal variant="left">
            <TiltCard className="demo-panel" intensity={5}>
              <div className="demo-head">
                <div className="demo-head-left">
                  <Activity size={16} />
                  Emotion Engine
                </div>
                <span className="demo-live-pill">Live</span>
              </div>

              {[
                { label: 'Sadness', value: 78 },
                { label: 'Calm', value: 52 },
                { label: 'Joy', value: 18 },
                { label: 'Anger', value: 9 },
                { label: 'Anxiety', value: 41 },
              ].map((item, index) => (
                <div key={item.label} className="meter-row">
                  <div className="meter-label">
                    <span>{item.label}</span>
                    <span>{item.value}%</span>
                  </div>
                  <div className="meter-track">
                    <div className="meter-fill" style={{ width: `${item.value}%`, animationDelay: `${index * 0.2}s` }} />
                  </div>
                </div>
              ))}

              <div className="demo-wave-box">
                <Waveform bars={28} />
              </div>
            </TiltCard>
          </Reveal>

          <Reveal variant="right" delay={0.1}>
            <div className="demo-panel">
              <div className="demo-head-left">
                <MessageSquare size={16} />
                Conversation
              </div>
              <div className="demo-conversation">
                {conversation.map((message, index) => (
                  <div
                    key={`${message.who}-${index}`}
                    className={`demo-row ${message.who === 'you' ? 'justify-end' : 'justify-start'} ${index <= active ? 'visible' : 'ghost'}`}
                  >
                    <div className={`demo-bubble ${message.who === 'you' ? 'user' : 'ai'}`}>
                      <p>{message.text}</p>
                      {message.emotion ? <div className="demo-bubble-meta">{message.emotion}</div> : null}
                    </div>
                  </div>
                ))}
              </div>

              <div className="demo-trigger-row">
                <button type="button" className="demo-trigger" onClick={() => onDemo('sad')}>Sad</button>
                <button type="button" className="demo-trigger cta" onClick={() => onDemo('happy')}>Happy</button>
                <button type="button" className="demo-trigger" onClick={() => onDemo('angry')}>Angry</button>
                <button type="button" className="demo-trigger" onClick={() => onDemo('fear')}>Fear</button>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function CTA({ onLaunch }) {
  return (
    <section id="launch" className="section">
      <div className="cta-shell">
        <Reveal variant="scale">
          <div className="cta-card border-beam">
            <div className="cta-bg" />
            <div className="cta-glow" />
            <div className="cta-content">
              <Sparkles size={40} className="cta-icon" />
              <h2>
                Ready to meet your <span className="text-gradient-animated">EMPATHIX</span>?
              </h2>
              <p>An AI that doesn&apos;t just hear words. It hears you.</p>
              <MagneticButton onClick={onLaunch} className="launch-button">
                <Mic size={20} />
                Launch EMPATHIX
              </MagneticButton>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-left">
          <div className="footer-dot" />
          <span>EMPATHIX · Built in 5 days</span>
        </div>
        <div className="site-footer-links">
          <a href="#demo">Demo</a>
          <a href="#tech">Tech</a>
        </div>
      </div>
    </footer>
  );
}

function LivePage({
  appState,
  audioLevel,
  chatOpen,
  error,
  messages,
  onBack,
  onToggleChat,
  onToggleListening,
  setChatOpen,
  chatInput,
  isSendingChat,
  onChatInputChange,
  onSendChat,
  hideSplash,
  showSplash,
  tone,
  intensity,
}) {
  return (
    <div className="app-shell">
      {showSplash ? <Splash onDone={hideSplash} /> : null}
      <CursorGlow />
      <div className="app-grid-bg" />
      <div className="app-ambient left" />
      <div className="app-ambient right" />

      <header className="app-header">
        <button type="button" className="glass-button" onClick={onBack}>
          <ArrowLeft size={14} />
          Back
        </button>

        <div className="brand-pill">
          <div className="brand-dot-wrap">
            <div className="brand-dot-outer" />
            <div className="brand-dot-inner-bg" />
            <div className="brand-dot-inner" />
          </div>
          <span className="text-gradient-animated">EMPATHIX</span>
        </div>

        <div className="app-header-actions">
          <div className="tone-pill">
            <span className={`tone-dot tone-${tone}`} />
            <span>Tone · {formatToneLabel(tone)}</span>
          </div>
          <button type="button" className="glass-button chat-trigger" onClick={onToggleChat} aria-expanded={chatOpen}>
            <MessageSquare size={14} />
            Chat
            <span className="chat-trigger-dot" />
          </button>
        </div>
      </header>

      <main className={`app-main ${chatOpen ? 'chat-open' : ''}`}>
        <section className="live-center">
          <button
            type="button"
            onClick={onToggleListening}
            aria-label={appState === 'listening' ? 'Stop recording' : 'Start recording'}
            aria-pressed={appState === 'listening'}
            className="orb-trigger"
          >
            <div className="orb-desktop">
              <AIOrb size={620} tone={tone} intensity={intensity} />
            </div>
            <div className="orb-mobile">
              <AIOrb size={340} tone={tone} intensity={intensity} />
            </div>
            <span className={`orb-center-indicator ${appState === 'listening' ? 'active' : ''}`}>
              {appState === 'listening' ? <MicOff size={24} /> : <Mic size={24} />}
              {appState === 'listening' ? <span className="orb-center-pulse" /> : null}
            </span>
          </button>

          <div className="wave-shell">
            <ReactiveWaveform active={appState === 'listening'} tone={tone} audioLevel={audioLevel} />
          </div>

          <div className="status-pill">
            <span className={`status-dot status-${appState}`} />
            <span>{statusText(appState)}</span>
          </div>

          {error ? <div className="error-card">{error}</div> : null}
        </section>
      </main>

      <div className={`drawer-overlay ${chatOpen ? 'visible' : ''}`} onClick={() => setChatOpen(false)} aria-hidden="true" />
      <aside className={`drawer ${chatOpen ? 'open' : ''}`} role="dialog" aria-label="Conversation">
        <Conversation
          messages={messages}
          chatInput={chatInput}
          isSendingChat={isSendingChat}
          onChatInputChange={onChatInputChange}
          onClose={() => setChatOpen(false)}
          onSendChat={onSendChat}
        />
      </aside>
    </div>
  );
}

function Conversation({ messages, chatInput, isSendingChat, onChatInputChange, onClose, onSendChat }) {
  const scrollerRef = useRef(null);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="conversation-card">
      <div className="conversation-header">
        <div className="conversation-title">
          <MessageSquare size={16} />
          <span>Conversation</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close conversation" className="conversation-close">
          <X size={16} />
        </button>
      </div>

      <div ref={scrollerRef} className="conversation-scroller">
        {messages.map((message) => (
          <div key={message.id} className={`conversation-row ${message.role === 'user' ? 'user' : 'ai'}`}>
            <div className={`conversation-bubble ${message.role === 'user' ? 'user' : 'ai'}`}>
              <p>{message.text}</p>
              {message.emotion ? (
                <p className="conversation-meta">
                  {message.emotion} · {message.confidence}%
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <form
        className="conversation-composer"
        onSubmit={(event) => {
          event.preventDefault();
          onSendChat();
        }}
      >
        <input
          type="text"
          value={chatInput}
          onChange={(event) => onChatInputChange(event.target.value)}
          className="conversation-input"
          placeholder="Type to EMPATHIX..."
          disabled={isSendingChat}
        />
        <button type="submit" className="conversation-send" disabled={isSendingChat || !chatInput.trim()}>
          {isSendingChat ? '...' : 'Send'}
        </button>
      </form>
    </div>
  );
}

function ReactiveWaveform({ active, tone, audioLevel }) {
  const bars = 56;
  return (
    <div className="reactive-waveform">
      {Array.from({ length: bars }).map((_, index) => (
        <div
          key={index}
          className={`reactive-wave-bar tone-${tone}`}
          style={{
            height: active ? `${14 + Math.sin(index * 0.6) * 22 + 22 + audioLevel * 14}px` : '4px',
            animation: active ? 'wave 1.2s ease-in-out infinite' : 'none',
            animationDelay: `${index * 0.04}s`,
            animationDuration: `${0.6 + (index % 5) * 0.15}s`,
          }}
        />
      ))}
    </div>
  );
}

function SectionHeader({ eyebrow, title, subtitle }) {
  return (
    <div className="section-header">
      <div className="section-eyebrow">{eyebrow}</div>
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
  );
}

function formatToneLabel(value) {
  if (!value) return 'Neutral';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function statusText(appState) {
  if (appState === 'listening') return 'Listening';
  if (appState === 'processing') return 'Analyzing';
  if (appState === 'speaking') return 'Responding';
  return 'Tap to speak';
}

function formatActionToast(action, message) {
  const cleaned = (message || '').replace(/\.$/, '');
  if (action === 'play_spotify_playlist') return `MUSIC: ${cleaned || 'Opened Spotify playlist'}`;
  if (action === 'open_spotify') return 'MUSIC: OPENED SPOTIFY';
  if (action === 'do_search') return `SEARCH: ${cleaned || 'Started search'}`;
  return action.replace(/_/g, ' ').toUpperCase();
}
