export function Waveform({ bars = 32 }: { bars?: number }) {
  return (
    <div className="flex h-16 items-center justify-center gap-1">
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className="w-1 rounded-full bg-gradient-to-t from-primary to-accent animate-wave"
          style={{
            height: `${20 + Math.sin(i * 0.5) * 30 + 30}px`,
            animationDelay: `${i * 0.05}s`,
            animationDuration: `${0.8 + (i % 4) * 0.2}s`,
          }}
        />
      ))}
    </div>
  );
}
