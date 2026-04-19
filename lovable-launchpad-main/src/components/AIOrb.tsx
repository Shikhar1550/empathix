type EmotionTone = "neutral" | "sad" | "happy" | "angry" | "calm" | "anxious";

const TONE_MAP: Record<
  EmotionTone,
  {
    coreFrom: string;
    coreVia: string;
    coreTo: string;
    glowOuter: string;
    ring: string;
    particle: string;
    shadow: string;
    highlight: string;
  }
> = {
  neutral: {
    coreFrom: "oklch(0.78 0.18 220)",
    coreVia: "oklch(0.65 0.2 250)",
    coreTo: "oklch(0.7 0.22 300)",
    glowOuter: "oklch(0.78 0.18 220 / 0.35)",
    ring: "oklch(0.78 0.18 220 / 0.5)",
    particle: "oklch(0.78 0.18 220)",
    shadow: "oklch(0.78 0.18 220 / 0.7)",
    highlight: "oklch(0.95 0.1 200 / 0.4)",
  },
  sad: {
    coreFrom: "oklch(0.5 0.15 260)",
    coreVia: "oklch(0.4 0.13 270)",
    coreTo: "oklch(0.55 0.2 280)",
    glowOuter: "oklch(0.5 0.18 270 / 0.45)",
    ring: "oklch(0.55 0.18 270 / 0.5)",
    particle: "oklch(0.6 0.18 270)",
    shadow: "oklch(0.45 0.2 270 / 0.8)",
    highlight: "oklch(0.7 0.15 260 / 0.4)",
  },
  happy: {
    coreFrom: "oklch(0.85 0.18 90)",
    coreVia: "oklch(0.8 0.2 60)",
    coreTo: "oklch(0.78 0.22 40)",
    glowOuter: "oklch(0.85 0.2 70 / 0.45)",
    ring: "oklch(0.85 0.2 70 / 0.55)",
    particle: "oklch(0.88 0.2 80)",
    shadow: "oklch(0.85 0.22 70 / 0.7)",
    highlight: "oklch(0.95 0.15 90 / 0.5)",
  },
  angry: {
    coreFrom: "oklch(0.65 0.25 25)",
    coreVia: "oklch(0.55 0.27 20)",
    coreTo: "oklch(0.5 0.25 15)",
    glowOuter: "oklch(0.65 0.27 25 / 0.5)",
    ring: "oklch(0.65 0.27 25 / 0.55)",
    particle: "oklch(0.7 0.27 25)",
    shadow: "oklch(0.6 0.27 25 / 0.8)",
    highlight: "oklch(0.85 0.2 30 / 0.4)",
  },
  calm: {
    coreFrom: "oklch(0.8 0.15 170)",
    coreVia: "oklch(0.75 0.17 180)",
    coreTo: "oklch(0.7 0.18 200)",
    glowOuter: "oklch(0.8 0.18 180 / 0.4)",
    ring: "oklch(0.8 0.18 180 / 0.5)",
    particle: "oklch(0.85 0.18 180)",
    shadow: "oklch(0.78 0.18 180 / 0.65)",
    highlight: "oklch(0.95 0.1 180 / 0.4)",
  },
  anxious: {
    coreFrom: "oklch(0.78 0.22 320)",
    coreVia: "oklch(0.65 0.24 310)",
    coreTo: "oklch(0.55 0.25 300)",
    glowOuter: "oklch(0.7 0.24 310 / 0.45)",
    ring: "oklch(0.7 0.24 310 / 0.55)",
    particle: "oklch(0.78 0.24 310)",
    shadow: "oklch(0.7 0.25 310 / 0.75)",
    highlight: "oklch(0.9 0.18 320 / 0.45)",
  },
};

export function AIOrb({
  size = 640,
  tone = "neutral",
  intensity = 1,
}: {
  size?: number;
  tone?: EmotionTone;
  intensity?: number;
}) {
  const c = TONE_MAP[tone];
  const clampedIntensity = Math.min(Math.max(intensity, 0.75), 1.5);
  const pulseSpeed = 5.4 - (clampedIntensity - 0.75) * 1.4;

  return (
    <div
      className="relative flex items-center justify-center transition-all duration-[1800ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
      style={{
        transition: "all 1.8s cubic-bezier(0.4, 0, 0.2, 1)",
        width: size,
        height: size,
      }}
    >
      <div
        className="absolute inset-0 rounded-full blur-3xl animate-glow-pulse transition-all duration-[1800ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${c.glowOuter}, transparent 70%)`,
          animationDuration: "6.5s",
          animationTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />

      <div
        className="absolute inset-[6%] rounded-full border animate-orb-rotate transition-colors duration-[1800ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{
          borderColor: c.ring,
          animationDuration: "28s",
          animationTimingFunction: "linear",
        }}
      >
        <div
          className="absolute -top-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full"
          style={{ background: c.particle, boxShadow: `0 0 20px ${c.particle}` }}
        />
        <div
          className="absolute -bottom-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full"
          style={{ background: c.coreTo }}
        />
      </div>

      <div
        className="absolute inset-[14%] rounded-full border animate-orb-rotate-rev transition-colors duration-[1800ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{
          borderColor: c.ring,
          animationDuration: "34s",
          animationTimingFunction: "linear",
        }}
      >
        <div
          className="absolute top-1/2 -left-1 h-2.5 w-2.5 -translate-y-1/2 rounded-full"
          style={{ background: c.coreVia, boxShadow: `0 0 20px ${c.coreVia}` }}
        />
      </div>

      <div
        className="absolute inset-[22%] rounded-full border-2 border-dashed animate-orb-rotate transition-colors duration-[1800ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{
          borderColor: c.ring,
          animationDuration: "52s",
          animationTimingFunction: "linear",
        }}
      />

      <div
        className="relative animate-orb-pulse transition-all duration-[1800ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{
          width: "44%",
          height: "44%",
          animationDuration: `${pulseSpeed}s`,
          animationTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <div
          className="absolute inset-0 rounded-full transition-all duration-[1800ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{
            background: `linear-gradient(135deg, ${c.coreFrom}, ${c.coreVia}, ${c.coreTo})`,
            boxShadow: `0 0 100px ${c.shadow}, inset -25px -25px 70px ${c.coreTo}, inset 25px 25px 70px ${c.highlight}`,
          }}
        />
        <div className="absolute left-1/4 top-1/4 h-[25%] w-[25%] rounded-full bg-white/40 blur-xl" />
        <div
          className="absolute inset-[18%] rounded-full blur-md animate-glow-pulse transition-all duration-[1800ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{
            background: `linear-gradient(45deg, ${c.coreVia}, ${c.coreFrom})`,
            animationDuration: "7.5s",
            animationTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
      </div>

      {[0, 60, 120, 180, 240, 300].map((deg, i) => (
        <div
          key={i}
          className="absolute inset-0 animate-orb-rotate"
          style={{
            animationDuration: `${24 + i * 3.5}s`,
            animationDelay: `${i * 0.45}s`,
            animationTimingFunction: "linear",
          }}
        >
          <div
            className="absolute h-3 w-3 rounded-full transition-colors duration-[1800ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{
              background: c.particle,
              boxShadow: `0 0 18px ${c.particle}`,
              top: "50%",
              left: "50%",
              transform: `rotate(${deg}deg) translateX(${size * 0.42}px) translateY(-50%)`,
            }}
          />
        </div>
      ))}
    </div>
  );
}

export type { EmotionTone };
