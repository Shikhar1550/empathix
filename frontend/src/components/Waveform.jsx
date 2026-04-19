export default function Waveform({ bars = 32 }) {
  return (
    <div className="decorative-waveform">
      {Array.from({ length: bars }).map((_, index) => (
        <div
          key={index}
          className="decorative-wave-bar"
          style={{
            height: `${20 + Math.sin(index * 0.5) * 30 + 30}px`,
            animationDelay: `${index * 0.05}s`,
            animationDuration: `${0.8 + (index % 4) * 0.2}s`,
          }}
        />
      ))}
    </div>
  );
}
