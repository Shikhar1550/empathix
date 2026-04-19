const TONE_MAP = {
  neutral: {
    coreFrom: 'oklch(0.78 0.18 220)',
    coreVia: 'oklch(0.65 0.2 250)',
    coreTo: 'oklch(0.7 0.22 300)',
    glowOuter: 'oklch(0.78 0.18 220 / 0.35)',
    ring: 'oklch(0.78 0.18 220 / 0.5)',
    particle: 'oklch(0.78 0.18 220)',
    shadow: 'oklch(0.78 0.18 220 / 0.7)',
    highlight: 'oklch(0.95 0.1 200 / 0.4)',
  },
  sad: {
    coreFrom: 'oklch(0.5 0.15 260)',
    coreVia: 'oklch(0.4 0.13 270)',
    coreTo: 'oklch(0.55 0.2 280)',
    glowOuter: 'oklch(0.5 0.18 270 / 0.45)',
    ring: 'oklch(0.55 0.18 270 / 0.5)',
    particle: 'oklch(0.6 0.18 270)',
    shadow: 'oklch(0.45 0.2 270 / 0.8)',
    highlight: 'oklch(0.7 0.15 260 / 0.4)',
  },
  happy: {
    coreFrom: 'oklch(0.85 0.18 90)',
    coreVia: 'oklch(0.8 0.2 60)',
    coreTo: 'oklch(0.78 0.22 40)',
    glowOuter: 'oklch(0.85 0.2 70 / 0.45)',
    ring: 'oklch(0.85 0.2 70 / 0.55)',
    particle: 'oklch(0.88 0.2 80)',
    shadow: 'oklch(0.85 0.22 70 / 0.7)',
    highlight: 'oklch(0.95 0.15 90 / 0.5)',
  },
  angry: {
    coreFrom: 'oklch(0.65 0.25 25)',
    coreVia: 'oklch(0.55 0.27 20)',
    coreTo: 'oklch(0.5 0.25 15)',
    glowOuter: 'oklch(0.65 0.27 25 / 0.5)',
    ring: 'oklch(0.65 0.27 25 / 0.55)',
    particle: 'oklch(0.7 0.27 25)',
    shadow: 'oklch(0.6 0.27 25 / 0.8)',
    highlight: 'oklch(0.85 0.2 30 / 0.4)',
  },
  calm: {
    coreFrom: 'oklch(0.8 0.15 170)',
    coreVia: 'oklch(0.75 0.17 180)',
    coreTo: 'oklch(0.7 0.18 200)',
    glowOuter: 'oklch(0.8 0.18 180 / 0.4)',
    ring: 'oklch(0.8 0.18 180 / 0.5)',
    particle: 'oklch(0.85 0.18 180)',
    shadow: 'oklch(0.78 0.18 180 / 0.65)',
    highlight: 'oklch(0.95 0.1 180 / 0.4)',
  },
  anxious: {
    coreFrom: 'oklch(0.78 0.22 320)',
    coreVia: 'oklch(0.65 0.24 310)',
    coreTo: 'oklch(0.55 0.25 300)',
    glowOuter: 'oklch(0.7 0.24 310 / 0.45)',
    ring: 'oklch(0.7 0.24 310 / 0.55)',
    particle: 'oklch(0.78 0.24 310)',
    shadow: 'oklch(0.7 0.25 310 / 0.75)',
    highlight: 'oklch(0.9 0.18 320 / 0.45)',
  },
};

export default function AIOrb({ size = 640, tone = 'neutral', intensity = 1 }) {
  const colors = TONE_MAP[tone] || TONE_MAP.neutral;
  const clampedIntensity = Math.min(1.8, Math.max(0.85, intensity));
  const energy = (clampedIntensity - 0.85) / 0.95;
  const pulseSpeed = Math.max(3.8, 6.2 - energy * 1.4);
  const glowScale = 1 + energy * 0.08;
  const coreScale = 1 + energy * 0.04;
  const glowOpacity = 0.58 + energy * 0.2;

  return (
    <div
      className="ai-orb-wrap"
      style={{
        width: size,
        height: size,
        '--orb-core-scale': coreScale,
        '--orb-glow-scale': glowScale,
        '--orb-glow-opacity': glowOpacity,
      }}
    >
      <div
        className="ai-orb-glow"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${colors.glowOuter}, transparent 70%)`,
        }}
      />

      <div className="ai-orb-ring ring-1" style={{ borderColor: colors.ring }}>
        <div className="ring-dot top" style={{ background: colors.particle, boxShadow: `0 0 20px ${colors.particle}` }} />
        <div className="ring-dot bottom" style={{ background: colors.coreTo }} />
      </div>

      <div className="ai-orb-ring ring-2" style={{ borderColor: colors.ring }}>
        <div className="ring-dot left" style={{ background: colors.coreVia, boxShadow: `0 0 20px ${colors.coreVia}` }} />
      </div>

      <div className="ai-orb-ring ring-3" style={{ borderColor: colors.ring }} />

      <div className="ai-orb-core" style={{ animationDuration: `${pulseSpeed}s` }}>
        <div
          className="ai-orb-core-surface"
          style={{
            background: `linear-gradient(135deg, ${colors.coreFrom}, ${colors.coreVia}, ${colors.coreTo})`,
            boxShadow: `0 0 100px ${colors.shadow}, inset -25px -25px 70px ${colors.coreTo}, inset 25px 25px 70px ${colors.highlight}`,
          }}
        />
        <div className="ai-orb-core-highlight" />
        <div
          className="ai-orb-core-inner"
          style={{ background: `linear-gradient(45deg, ${colors.coreVia}, ${colors.coreFrom})` }}
        />
      </div>

      {[0, 60, 120, 180, 240, 300].map((deg, index) => (
        <div
          key={deg}
          className="ai-orb-orbit"
          style={{ animationDuration: `${15 + index * 2}s`, animationDelay: `${index * 0.3}s` }}
        >
          <div
            className="ai-orb-particle"
            style={{
              background: colors.particle,
              boxShadow: `0 0 18px ${colors.particle}`,
              transform: `rotate(${deg}deg) translateX(${size * 0.42}px) translateY(-50%)`,
            }}
          />
        </div>
      ))}
    </div>
  );
}
