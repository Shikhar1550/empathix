import { useEffect, useRef, useState } from 'react';

/**
 * EmotionBadge — Displays detected emotion name, confidence %, icon, and score bar chart.
 *
 * Props:
 *   emotion     — string ('sad', 'happy', 'angry', 'fear', 'neutral', 'surprise')
 *   confidence  — float 0..1
 *   allScores   — { emotion: score } object
 */

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

const SHAPE_CLASS = {
  sad:       'emotion-shape-sad',
  happy:     'emotion-shape-happy',
  angry:     'emotion-shape-angry',
  fear:      'emotion-shape-fear',
  fearful:   'emotion-shape-fear',
  neutral:   'emotion-shape-neutral',
  surprise:  'emotion-shape-surprise',
  surprised: 'emotion-shape-surprise',
};

function AnimatedNumber({ value, suffix = '' }) {
  const [display, setDisplay] = useState(value);
  const rafRef = useRef(null);
  const startRef = useRef(display);
  const startTimeRef = useRef(null);

  useEffect(() => {
    startRef.current = display;
    startTimeRef.current = performance.now();
    const duration = 600;

    const tick = (now) => {
      const elapsed = now - (startTimeRef.current || now);
      const t = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(startRef.current + (value - startRef.current) * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => rafRef.current && cancelAnimationFrame(rafRef.current);
  }, [value]);

  return <>{display}{suffix}</>;
}

export default function EmotionBadge({
  emotion = 'neutral',
  confidence = 0,
  allScores = {},
}) {
  const color = EMOTION_COLORS[emotion] || EMOTION_COLORS.neutral;
  const shapeClass = SHAPE_CLASS[emotion] || SHAPE_CLASS.neutral;
  const pct = Math.round(confidence * 100);

  // Normalize emotion label for display
  const label = (emotion || 'neutral').toUpperCase();

  // Build score bars — sort by value descending
  const scoreEntries = Object.entries(allScores || {}).sort(
    ([, a], [, b]) => b - a
  );

  return (
    <div className="emotion-badge-container">
      {/* Icon + Name row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="emotion-icon-shape" style={{ color }}>
          <div className={shapeClass} />
        </div>
        <span className="emotion-name" style={{ color }}>
          {label}
        </span>
      </div>

      {/* Confidence */}
      <div className="emotion-confidence" style={{ color }}>
        <AnimatedNumber value={pct} suffix="%" />
      </div>

      {/* Score bars */}
      {scoreEntries.length > 0 && (
        <div className="emotion-scores">
          {scoreEntries.map(([name, score]) => {
            const barColor = EMOTION_COLORS[name] || '#555';
            const height = Math.max(score * 36, 2);
            const isActive = name.toLowerCase() === emotion.toLowerCase();
            return (
              <div className="emotion-score-bar" key={name}>
                <div
                  className="emotion-score-bar-fill"
                  style={{
                    height,
                    backgroundColor: barColor,
                    opacity: isActive ? 1 : 0.35,
                  }}
                />
                <span
                  className="emotion-score-bar-label"
                  style={{ color: isActive ? barColor : undefined }}
                >
                  {name.slice(0, 3)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
