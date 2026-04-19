const EMOTION_COLORS = {
  sad: '#5cc8ff',
  happy: '#ffd23a',
  angry: '#ff3aa1',
  fear: '#a050ff',
  fearful: '#a050ff',
  neutral: '#7a3cff',
  surprise: '#ff8a3a',
  surprised: '#ff8a3a',
  calm: '#5cf2ff',
  excited: '#ff8fd1',
  disgusted: '#3affc8',
};

export default function EmotionBadge({
  emotion = 'neutral',
  confidence = 0,
}) {
  const color = EMOTION_COLORS[emotion] || EMOTION_COLORS.neutral;
  const pct = Math.round(Math.max(0, Math.min(confidence, 1)) * 100);

  return (
    <section className="emotion-card" style={{ '--emotion-accent': color }}>
      <div className="emotion-scan" />
      <div className="emotion-corner emotion-corner-tl" />
      <div className="emotion-corner emotion-corner-tr" />
      <div className="emotion-corner emotion-corner-bl" />
      <div className="emotion-corner emotion-corner-br" />

      <div className="emotion-label">VOICE TONE DETECTED</div>
      <div className="emotion-name">{emotion.toUpperCase()}</div>

      <div className="emotion-meter">
        <div className="emotion-meter-track">
          <div className="emotion-meter-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="emotion-meter-value">{pct}%</span>
      </div>
    </section>
  );
}
