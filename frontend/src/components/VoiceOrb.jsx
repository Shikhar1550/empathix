import { useEffect, useRef } from 'react';

const EMOTION_COLORS = {
  sad: { hex: '#5cc8ff', rgb: [92, 200, 255] },
  happy: { hex: '#ffd23a', rgb: [255, 210, 58] },
  angry: { hex: '#ff3aa1', rgb: [255, 58, 161] },
  fear: { hex: '#a050ff', rgb: [160, 80, 255] },
  fearful: { hex: '#a050ff', rgb: [160, 80, 255] },
  neutral: { hex: '#7a3cff', rgb: [122, 60, 255] },
  surprise: { hex: '#ff8a3a', rgb: [255, 138, 58] },
  surprised: { hex: '#ff8a3a', rgb: [255, 138, 58] },
  calm: { hex: '#5cf2ff', rgb: [92, 242, 255] },
  excited: { hex: '#ff8fd1', rgb: [255, 143, 209] },
  disgusted: { hex: '#3affc8', rgb: [58, 255, 200] },
};

const PARTICLE_COUNT = 3600;
const BASE_RADIUS = 120;

export default function VoiceOrb({
  emotion = 'neutral',
  isListening = false,
  isProcessing = false,
  isSpeaking = false,
  audioLevel = 0,
}) {
  const canvasRef = useRef(null);
  const frameRef = useRef(0);
  const sizeRef = useRef(300);
  const timeRef = useRef(0);
  const lastImpulseRef = useRef(0);
  const particleStateRef = useRef(null);

  const color = EMOTION_COLORS[emotion] || EMOTION_COLORS.neutral;

  useEffect(() => {
    const rest = new Float32Array(PARTICLE_COUNT * 3);
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const vel = new Float32Array(PARTICLE_COUNT * 3);
    const meta = new Float32Array(PARTICLE_COUNT * 3);

    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / PARTICLE_COUNT);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const radius = BASE_RADIUS + (Math.random() - 0.5) * 3;
      const offset = i * 3;

      rest[offset] = radius * Math.sin(phi) * Math.cos(theta);
      rest[offset + 1] = radius * Math.sin(phi) * Math.sin(theta);
      rest[offset + 2] = radius * Math.cos(phi);

      pos[offset] = rest[offset];
      pos[offset + 1] = rest[offset + 1];
      pos[offset + 2] = rest[offset + 2];

      meta[offset] = 0.7 + Math.random() * 2.2;
      meta[offset + 1] = 0.6 + Math.random() * 0.4;
      meta[offset + 2] = Math.random() * Math.PI * 2;
    }

    particleStateRef.current = { rest, pos, vel, meta };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !particleStateRef.current) return undefined;

    const context = canvas.getContext('2d');
    if (!context) return undefined;

    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      const size = Math.max(260, Math.min(rect.width || 300, rect.height || 300));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      sizeRef.current = size;
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const impulseScatter = (strength) => {
      const particles = particleStateRef.current;
      if (!particles) return;

      for (let i = 0; i < PARTICLE_COUNT; i += 1) {
        const offset = i * 3;
        const nx = particles.rest[offset] / BASE_RADIUS;
        const ny = particles.rest[offset + 1] / BASE_RADIUS;
        const nz = particles.rest[offset + 2] / BASE_RADIUS;
        const force = (1.5 + Math.random() * 3.5) * strength;

        particles.vel[offset] += nx * force + (Math.random() - 0.5) * 1.2;
        particles.vel[offset + 1] += ny * force + (Math.random() - 0.5) * 1.2;
        particles.vel[offset + 2] += nz * force + (Math.random() - 0.5) * 1.2;
      }
    };

    if (isSpeaking) impulseScatter(0.9);

    const draw = () => {
      const particles = particleStateRef.current;
      if (!particles) return;

      const size = sizeRef.current;
      const center = size / 2;
      const scale = size / 300;
      const { rest, pos, vel, meta } = particles;

      timeRef.current += 0.008;
      const time = timeRef.current;

      context.clearRect(0, 0, size, size);

      if (audioLevel > 0.18 && performance.now() - lastImpulseRef.current > 120) {
        impulseScatter(Math.min(0.5, audioLevel * 0.6));
        lastImpulseRef.current = performance.now();
      }

      const damping = 0.92;
      const spring = isProcessing ? 0.06 : 0.045;

      for (let i = 0; i < PARTICLE_COUNT; i += 1) {
        const offset = i * 3;
        const dx = rest[offset] - pos[offset];
        const dy = rest[offset + 1] - pos[offset + 1];
        const dz = rest[offset + 2] - pos[offset + 2];

        vel[offset] = (vel[offset] + dx * spring) * damping;
        vel[offset + 1] = (vel[offset + 1] + dy * spring) * damping;
        vel[offset + 2] = (vel[offset + 2] + dz * spring) * damping;

        pos[offset] += vel[offset];
        pos[offset + 1] += vel[offset + 1];
        pos[offset + 2] += vel[offset + 2];
      }

      const rotationX = time * 0.55;
      const rotationY = time * 0.85;
      const cosX = Math.cos(rotationX);
      const sinX = Math.sin(rotationX);
      const cosY = Math.cos(rotationY);
      const sinY = Math.sin(rotationY);
      const breathe = 1 + Math.sin(time * 1.1) * (isListening ? 0.05 : 0.025);

      const visible = new Array(PARTICLE_COUNT);

      for (let i = 0; i < PARTICLE_COUNT; i += 1) {
        const offset = i * 3;
        let ox = pos[offset] * breathe;
        let oy = pos[offset + 1] * breathe;
        let oz = pos[offset + 2] * breathe;

        if (audioLevel > 0.05) {
          const shimmer = Math.sin(time * 5 + meta[offset + 2]) * audioLevel * 6;
          const nx = rest[offset] / BASE_RADIUS;
          const ny = rest[offset + 1] / BASE_RADIUS;
          const nz = rest[offset + 2] / BASE_RADIUS;
          ox += nx * shimmer;
          oy += ny * shimmer;
          oz += nz * shimmer;
        }

        const y2 = oy * cosX - oz * sinX;
        const z2 = oy * sinX + oz * cosX;
        const x3 = ox * cosY + z2 * sinY;
        const z3 = -ox * sinY + z2 * cosY;
        const perspective = 200 / (200 + z3);

        visible[i] = {
          x: center + x3 * perspective * scale,
          y: center + y2 * perspective * scale,
          z: z3,
          scale: perspective,
          size: meta[offset],
          brightness: meta[offset + 1],
        };
      }

      visible.sort((a, b) => a.z - b.z);

      const core = context.createRadialGradient(center, center, 0, center, center, BASE_RADIUS * scale);
      core.addColorStop(0, `rgba(255,255,255,${0.35 + audioLevel * 0.3})`);
      core.addColorStop(
        0.18,
        `rgba(${Math.min(255, color.rgb[0] + 80)},${Math.min(255, color.rgb[1] + 60)},${Math.min(255, color.rgb[2] + 40)},${0.32 + audioLevel * 0.25})`
      );
      core.addColorStop(0.5, `rgba(${color.rgb[0]},${color.rgb[1]},${color.rgb[2]},${0.16 + audioLevel * 0.18})`);
      core.addColorStop(0.85, `rgba(${color.rgb[0]},${color.rgb[1]},${color.rgb[2]},0.04)`);
      core.addColorStop(1, 'rgba(0,0,0,0)');

      context.fillStyle = core;
      context.beginPath();
      context.arc(center, center, BASE_RADIUS * scale * 1.05, 0, Math.PI * 2);
      context.fill();

      for (let i = 0; i < visible.length; i += 1) {
        const point = visible[i];
        const depth = (point.z + BASE_RADIUS) / (BASE_RADIUS * 2);
        const alpha = Math.min(0.95, (0.35 + depth * 0.6) * point.brightness);
        const dotSize = point.size * point.scale * scale;

        if (dotSize < 0.3) continue;

        const red = Math.min(255, (color.rgb[0] * 0.55 + color.rgb[0] * 0.45 * depth + 25) | 0);
        const green = Math.min(255, (color.rgb[1] * 0.55 + color.rgb[1] * 0.45 * depth + 15) | 0);
        const blue = Math.min(255, (color.rgb[2] * 0.55 + color.rgb[2] * 0.45 * depth + 30) | 0);

        if (dotSize > 1.2) {
          const glow = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, dotSize * 2.4);
          glow.addColorStop(
            0,
            `rgba(${Math.min(255, red + 90)},${Math.min(255, green + 90)},${Math.min(255, blue + 90)},${Math.min(1, alpha + 0.25)})`
          );
          glow.addColorStop(0.45, `rgba(${red},${green},${blue},${alpha})`);
          glow.addColorStop(1, `rgba(${red},${green},${blue},0)`);
          context.fillStyle = glow;
          context.beginPath();
          context.arc(point.x, point.y, dotSize * 2.4, 0, Math.PI * 2);
          context.fill();
        }

        context.fillStyle = `rgba(${Math.min(255, red + 60)},${Math.min(255, green + 60)},${Math.min(255, blue + 60)},${Math.min(1, alpha + 0.15)})`;
        context.beginPath();
        context.arc(point.x, point.y, Math.max(0.4, dotSize * 0.7), 0, Math.PI * 2);
        context.fill();
      }

      for (let ring = 0; ring < 2; ring += 1) {
        const radius = (ring === 0 ? 134 : 154) * scale;
        const opacity = ring === 0 ? 0.32 : 0.18;

        context.beginPath();
        for (let angle = 0; angle <= Math.PI * 2; angle += 0.04) {
          const wobble =
            ring === 0
              ? Math.sin(angle * 3 + time * 1.8) * 3
              : Math.sin(angle * 5 - time) * 1.8;
          const x = center + (radius + wobble * scale) * Math.cos(angle);
          const y = center + (radius + wobble * scale) * Math.sin(angle) * (ring === 0 ? 0.26 : 0.2);
          if (angle === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.strokeStyle = `rgba(${color.rgb[0]},${color.rgb[1]},${color.rgb[2]},${opacity + audioLevel * 0.2})`;
        context.lineWidth = ring === 0 ? 1.2 : 0.7;
        context.stroke();
      }

      frameRef.current = requestAnimationFrame(draw);
    };

    fit();
    frameRef.current = requestAnimationFrame(draw);
    window.addEventListener('resize', fit);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', fit);
    };
  }, [audioLevel, color, isListening, isProcessing, isSpeaking]);

  return (
    <div className="voice-orb-shell">
      <div
        className="voice-orb-aura"
        style={{
          '--orb-accent': color.hex,
          boxShadow: `0 0 90px ${color.hex}59, 0 0 180px ${color.hex}1f`,
        }}
      />
      <canvas ref={canvasRef} className="voice-orb-canvas" aria-hidden="true" />
    </div>
  );
}
