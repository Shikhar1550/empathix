import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Mic,
  Brain,
  Volume2,
  Terminal,
  Sparkles,
  Zap,
  Heart,
  Activity,
  Github,
  ArrowRight,
  Cpu,
  Waves,
  MessageSquare,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { AIOrb } from "@/components/AIOrb";
import { Waveform } from "@/components/Waveform";
import { Reveal } from "@/components/Reveal";
import { TiltCard } from "@/components/TiltCard";
import { CursorGlow } from "@/components/CursorGlow";
import { ScrollProgress } from "@/components/ScrollProgress";
import { MagneticButton } from "@/components/MagneticButton";
import { useScrollY } from "@/hooks/useReveal";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EMPATHIX — Voice Emotion AI Assistant" },
      {
        name: "description",
        content:
          "EMPATHIX is a Jarvis-like voice AI that detects emotion from your tone, replies with empathy via Claude, speaks back through ElevenLabs, and runs OS commands.",
      },
      { property: "og:title", content: "EMPATHIX — Voice Emotion AI Assistant" },
      {
        property: "og:description",
        content: "Your empathetic AI companion. Voice-first. Emotion-aware. Built like Jarvis.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <ScrollProgress />
      <CursorGlow />
      <BackgroundFX />
      <Navbar />
      <Hero />
      <Features />
      <FlowSection />
      <TechStack />
      <DemoSection />
      <CTA />
      <Footer />
    </div>
  );
}

function BackgroundFX() {
  const y = useScrollY();
  return (
    <div className="pointer-events-none fixed inset-0 z-0">
      <div
        className="absolute inset-0 bg-grid opacity-30 animate-grid-move"
        style={{ transform: `translateY(${y * 0.15}px)` }}
      />
      <div
        className="absolute left-1/2 top-0 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]"
        style={{ transform: `translate(-50%, ${y * 0.3}px)` }}
      />
      <div
        className="absolute bottom-0 right-0 h-[500px] w-[500px] rounded-full bg-accent/20 blur-[120px]"
        style={{ transform: `translateY(${-y * 0.2}px)` }}
      />
      <div
        className="absolute left-0 top-1/2 h-[400px] w-[400px] rounded-full bg-primary/15 blur-[100px]"
        style={{ transform: `translateY(${-y * 0.15}px)` }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
    </div>
  );
}

function Hero() {
  const y = useScrollY();
  const navigate = useNavigate();
  const launch = () => navigate({ to: "/app" });
  return (
    <section className="relative z-10 flex min-h-screen items-center justify-center px-6 pt-32">
      <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2">
        <div className="space-y-8">
          <Reveal variant="up" delay={0.05}>
            <div className="inline-flex items-center gap-2 rounded-full glass px-4 py-2 text-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              <span className="text-muted-foreground">Now listening · v1.0 beta</span>
            </div>
          </Reveal>

          <Reveal variant="blur" delay={0.15}>
            <h1 className="font-display text-6xl font-bold leading-[0.95] tracking-tight max-md:text-5xl lg:text-7xl">
              Your AI that
              <br />
              <span className="text-gradient-animated">feels you.</span>
            </h1>
          </Reveal>

          <Reveal variant="up" delay={0.25}>
            <p className="max-w-xl text-lg text-muted-foreground">
              EMPATHIX listens to your voice, reads the emotion in your tone, and replies with the
              empathy of a real friend — then runs your commands. A Jarvis built on emotion.
            </p>
          </Reveal>

          <Reveal variant="up" delay={0.35}>
            <div className="flex flex-wrap items-center gap-4">
              <MagneticButton onClick={launch} className="group inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-accent px-7 py-4 font-semibold text-primary-foreground shadow-[0_0_40px_oklch(0.78_0.18_220/0.4)] hover:shadow-[0_0_60px_oklch(0.78_0.18_220/0.7)]">
                <Mic className="h-5 w-5" />
                Start Talking
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </MagneticButton>
            </div>
          </Reveal>

          <Reveal variant="up" delay={0.45}>
            <div className="grid grid-cols-3 gap-4 pt-8">
              {[
                { v: "12+", l: "Emotions detected" },
                { v: "<400ms", l: "Response latency" },
                { v: "100%", l: "Local STT" },
              ].map((s) => (
                <TiltCard key={s.l} className="rounded-2xl glass p-4" intensity={6}>
                  <div className="text-2xl font-bold text-gradient">{s.v}</div>
                  <div className="text-xs text-muted-foreground">{s.l}</div>
                </TiltCard>
              ))}
            </div>
          </Reveal>
        </div>

        <div
          className="relative flex items-center justify-center animate-float"
          style={{ transform: `translateY(${-y * 0.1}px)` }}
        >
          <AIOrb />
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
            <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent animate-scan" />
          </div>
        </div>
      </div>
    </section>
  );
}


function Features() {
  const features = [
    { icon: Mic, title: "Voice-First Input", desc: "Whisper STT runs locally. No cloud audio leaks. Press, speak, done." },
    { icon: Heart, title: "Emotion from Tone", desc: "SpeechBrain wav2vec2 reads sadness, joy, anger, calm — straight from your voice." },
    { icon: Brain, title: "Empathetic Mind", desc: "Claude Sonnet 4 crafts replies tuned to how you actually feel — not just what you say." },
    { icon: Volume2, title: "Natural Speech", desc: "ElevenLabs TTS speaks back with warmth. pyttsx3 fallback when offline." },
    { icon: Terminal, title: "OS Control", desc: "Open Spotify, draft mail, play music — EMPATHIX runs commands on your machine." },
    { icon: Zap, title: "Real-time Async", desc: "FastAPI + asyncio pipeline. Streams from mic to mind to mouth in under half a second." },
  ];

  return (
    <section id="features" className="relative z-10 px-6 py-32">
      <div className="mx-auto max-w-7xl">
        <Reveal variant="up">
          <SectionHeader
            eyebrow="Capabilities"
            title="Built like Jarvis. Tuned like a friend."
            subtitle="Every layer of EMPATHIX is engineered for emotional fidelity and instant response."
          />
        </Reveal>

        <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <Reveal key={f.title} variant="up" delay={i * 0.08}>
              <TiltCard className="group h-full overflow-hidden rounded-3xl glass p-8 hover:bg-primary/5">
                <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-primary/10 blur-2xl transition-all group-hover:bg-primary/40" />
                <div className="relative space-y-4">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 ring-1 ring-primary/30 transition-transform duration-500 group-hover:rotate-12 group-hover:scale-110">
                    <f.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold">{f.title}</h3>
                  <p className="text-sm text-muted-foreground">{f.desc}</p>
                </div>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function FlowSection() {
  const steps = [
    { icon: Mic, label: "Mic", color: "from-primary to-cyan" },
    { icon: Waves, label: "Tone Analysis", color: "from-cyan to-accent" },
    { icon: Brain, label: "Claude Empathy", color: "from-accent to-primary" },
    { icon: Volume2, label: "TTS Voice", color: "from-primary to-accent" },
    { icon: Terminal, label: "Execute", color: "from-accent to-cyan" },
  ];

  return (
    <section className="relative z-10 px-6 py-32">
      <div className="mx-auto max-w-7xl">
        <Reveal>
          <SectionHeader
            eyebrow="Pipeline"
            title="From breath to action in 400ms"
            subtitle="A streaming async pipeline keeps the conversation feeling alive."
          />
        </Reveal>

        <Reveal variant="scale" delay={0.1}>
          <div className="mt-20 rounded-3xl glass border-beam p-10">
            <div className="flex items-center justify-between gap-2 max-md:flex-col">
              {steps.map((s, i) => (
                <div key={s.label} className="flex flex-1 items-center max-md:w-full">
                  <Reveal variant="scale" delay={i * 0.12}>
                    <div className="flex flex-1 flex-col items-center gap-3">
                      <div
                        className={`relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br ${s.color} shadow-[0_0_30px_oklch(0.78_0.18_220/0.4)] transition-transform duration-300 hover:scale-110 hover:rotate-6`}
                      >
                        <s.icon className="h-8 w-8 text-primary-foreground" />
                        <div className="absolute inset-0 rounded-2xl bg-white/10 animate-glow-pulse" />
                      </div>
                      <span className="text-sm font-semibold">{s.label}</span>
                    </div>
                  </Reveal>
                  {i < steps.length - 1 && (
                    <div className="relative mx-2 h-px flex-1 bg-gradient-to-r from-primary/50 to-accent/50 max-md:hidden">
                      <div className="absolute -top-1 left-0 h-2 w-2 rounded-full bg-primary animate-glow-pulse" />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-12">
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
    { name: "Python", cat: "Core" },
    { name: "FastAPI", cat: "Backend" },
    { name: "asyncio", cat: "Concurrency" },
    { name: "SpeechBrain", cat: "Emotion AI" },
    { name: "wav2vec2", cat: "Model" },
    { name: "Whisper", cat: "STT" },
    { name: "Claude Sonnet 4", cat: "LLM" },
    { name: "ElevenLabs", cat: "TTS" },
    { name: "React + Vite", cat: "Frontend" },
    { name: "Tailwind v4", cat: "UI" },
    { name: "uvicorn", cat: "Server" },
    { name: "HuggingFace", cat: "Models" },
  ];

  return (
    <section id="tech" className="relative z-10 px-6 py-32">
      <div className="mx-auto max-w-7xl">
        <Reveal>
          <SectionHeader
            eyebrow="Stack"
            title="Engineered with care"
            subtitle="Best-in-class models stitched into a real-time system."
          />
        </Reveal>

        <div className="mt-16 grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {stack.map((t, i) => (
            <Reveal key={t.name} variant="up" delay={i * 0.04}>
              <TiltCard className="group overflow-hidden rounded-2xl glass p-5 hover:bg-primary/10" intensity={8}>
                <div className="flex items-center gap-3">
                  <Cpu className="h-5 w-5 text-primary opacity-60 transition-all duration-500 group-hover:rotate-180 group-hover:opacity-100" />
                  <div>
                    <div className="text-xs text-muted-foreground">{t.cat}</div>
                    <div className="font-semibold">{t.name}</div>
                  </div>
                </div>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function DemoSection() {
  const [active, setActive] = useState(0);
  const conversation = [
    { who: "you", text: "Ugh, today was a disaster…", emotion: "Sad · 87%" },
    { who: "ai", text: "I hear it in your voice. Want me to put on something calming and dim the lights?" },
    { who: "you", text: "Yeah. And open Spotify.", emotion: "Calm · 64%" },
    { who: "ai", text: "Done. Playing your 'Soft Evenings' playlist now. I'm here if you need to talk." },
  ];

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const id = setInterval(() => {
      setActive((a) => (a + 1) % conversation.length);
    }, 2500);
    return () => clearInterval(id);
  }, [conversation.length]);

  return (
    <section id="demo" className="relative z-10 px-6 py-32">
      <div className="mx-auto max-w-7xl">
        <Reveal>
          <SectionHeader
            eyebrow="Live Demo"
            title="See empathy in action"
            subtitle="A glimpse of a real EMPATHIX conversation."
          />
        </Reveal>

        <div className="mt-16 grid gap-8 lg:grid-cols-[1fr_1.2fr]">
          <Reveal variant="left">
            <TiltCard className="rounded-3xl glass p-8" intensity={5}>
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Activity className="h-4 w-4 text-primary" />
                  Emotion Engine
                </div>
                <span className="rounded-full bg-primary/20 px-3 py-1 text-xs text-primary">
                  Live
                </span>
              </div>
              {[
                { label: "Sadness", v: 78 },
                { label: "Calm", v: 52 },
                { label: "Joy", v: 18 },
                { label: "Anger", v: 9 },
                { label: "Anxiety", v: 41 },
              ].map((e, i) => (
                <div key={e.label} className="mb-5">
                  <div className="mb-2 flex justify-between text-sm">
                    <span className="text-muted-foreground">{e.label}</span>
                    <span className="font-mono text-primary">{e.v}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-1000"
                      style={{ width: `${e.v}%`, animationDelay: `${i * 0.2}s` }}
                    />
                  </div>
                </div>
              ))}

              <div className="mt-8 rounded-2xl bg-background/50 p-4">
                <Waveform bars={28} />
              </div>
            </TiltCard>
          </Reveal>

          <Reveal variant="right" delay={0.1}>
            <div className="rounded-3xl glass p-8" ref={ref}>
              <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
                <MessageSquare className="h-4 w-4 text-primary" />
                Conversation
              </div>
              <div className="space-y-4">
                {conversation.map((m, i) => (
                  <div
                    key={i}
                    className={`flex ${m.who === "you" ? "justify-end" : "justify-start"} transition-all duration-700 ${
                      i <= active ? "translate-y-0 opacity-100" : "translate-y-4 opacity-30"
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-5 py-3 ${
                        m.who === "you"
                          ? "bg-primary/20 text-foreground"
                          : "bg-gradient-to-br from-primary to-accent text-primary-foreground"
                      }`}
                    >
                      <p className="text-sm">{m.text}</p>
                      {m.emotion && (
                        <div className="mt-1 text-[10px] font-mono opacity-70">{m.emotion}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function CTA() {
  const navigate = useNavigate();
  const launch = () => navigate({ to: "/app" });
  return (
    <section id="launch" className="relative z-10 px-6 py-32">
      <div className="mx-auto max-w-5xl">
        <Reveal variant="scale">
          <div className="relative overflow-hidden rounded-[2.5rem] glass border-beam p-16 text-center max-md:p-10">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-accent/20" />
            <div className="absolute -top-32 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-primary/40 blur-3xl animate-glow-pulse" />

            <div className="relative space-y-6">
              <Sparkles className="mx-auto h-10 w-10 text-primary animate-glow-pulse" />
              <h2 className="font-display text-5xl font-bold max-md:text-3xl">
                Ready to meet your <span className="text-gradient-animated">EMPATHIX</span>?
              </h2>
              <p className="mx-auto max-w-2xl text-muted-foreground">
                An AI that doesn't just hear words. It hears you.
              </p>
              <MagneticButton onClick={launch} className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-accent px-8 py-4 font-semibold text-primary-foreground shadow-[0_0_60px_oklch(0.78_0.18_220/0.5)]">
                <Mic className="h-5 w-5" />
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
    <footer className="relative z-10 border-t border-border/50 px-6 py-10">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-primary animate-glow-pulse" />
          <span>EMPATHIX · Built in 5 days</span>
        </div>
        <div className="flex items-center gap-6">
          <a href="#" className="transition-colors hover:text-foreground">GitHub</a>
          <a href="#" className="transition-colors hover:text-foreground">Privacy</a>
        </div>
      </div>
    </footer>
  );
}

function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <div className="mb-4 inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs uppercase tracking-widest text-primary">
        {eyebrow}
      </div>
      <h2 className="font-display text-5xl font-bold tracking-tight max-md:text-3xl">{title}</h2>
      <p className="mt-4 text-muted-foreground">{subtitle}</p>
    </div>
  );
}
