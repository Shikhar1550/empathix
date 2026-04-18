import { useMemo } from 'react';

/**
 * VoiceOrb — The core visual element of EMPATHIX.
 * A 220px animated orb that reflects voice state and detected emotion.
 *
 * Props:
 *   emotion       — 'sad' | 'happy' | 'angry' | 'fear' | 'neutral' | 'surprise'
 *   isListening   — boolean
 *   isProcessing  — boolean
 *   isSpeaking    — boolean
 *   audioLevel    — 0..1 (maps to 1.0–1.15 scale)
 */

const EMOTION_COLORS = {
  sad:      '#4A90D9',
  happy:    '#F5C842',
  angry:    '#E8453C',
  fear:     '#9B59B6',
  fearful:  '#9B59B6',
  neutral:  '#7F8C8D',
  surprise: '#E67E22',
  surprised:'#E67E22',
  calm:     '#22D3EE',
  excited:  '#F472B6',
  disgusted:'#4ADE80',
};

export default function VoiceOrb({
  emotion = 'neutral',
  isListening = false,
  isProcessing = false,
  isSpeaking = false,
  audioLevel = 0,
}) {
  const glowColor = EMOTION_COLORS[emotion] || EMOTION_COLORS.neutral;

  // audioLevel 0→1 maps to scale 1.0→1.15
  const audioScale = 1 + Math.min(audioLevel, 1) * 0.15;

  // Determine state class
  const stateClass = isListening
    ? 'is-listening'
    : isProcessing
    ? 'is-processing'
    : isSpeaking
    ? 'is-speaking'
    : 'is-idle';

  // Compute box-shadow layers for glow
  const glowShadow = useMemo(() => {
    const baseAlpha = isListening ? 0.45 : isSpeaking ? 0.35 : isProcessing ? 0.25 : 0.15;
    return [
      `0 0 60px ${glowColor}${Math.round(baseAlpha * 255).toString(16).padStart(2, '0')}`,
      `0 0 120px ${glowColor}${Math.round(baseAlpha * 0.5 * 255).toString(16).padStart(2, '0')}`,
      `inset 0 0 40px ${glowColor}${Math.round(baseAlpha * 0.3 * 255).toString(16).padStart(2, '0')}`,
    ].join(', ');
  }, [glowColor, isListening, isSpeaking, isProcessing]);

  return (
    <div
      className={`voice-orb-wrapper ${stateClass}`}
      style={{ '--orb-glow-color': glowColor }}
    >
      {/* Ripple rings — visible when listening */}
      <div className="voice-orb-ripple" />
      <div className="voice-orb-ripple" />
      <div className="voice-orb-ripple" />
      <div className="voice-orb-ripple" />

      {/* Main orb */}
      <div
        className="voice-orb"
        style={{
          boxShadow: glowShadow,
          transform: `scale(${audioScale})`,
          background: `radial-gradient(circle at 45% 40%, ${glowColor}18 0%, #1A1A2E 70%)`,
        }}
      />

      {/* Processing spinner rings */}
      <div className="voice-orb-processing-ring" />
    </div>
  );
}
