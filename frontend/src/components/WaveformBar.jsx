import { useEffect, useRef, useCallback } from 'react';

/**
 * WaveformBar — 40 vertical bars that react to mic input via Web Audio API.
 *
 * Props:
 *   isRecording  — boolean
 *   audioStream  — MediaStream from getUserMedia (null when not recording)
 *   emotionColor — string hex color for bars
 */

const BAR_COUNT = 40;

export default function WaveformBar({
  isRecording = false,
  audioStream = null,
  emotionColor = '#7F8C8D',
}) {
  const barsRef = useRef([]);
  const analyserRef = useRef(null);
  const audioCtxRef = useRef(null);
  const rafRef = useRef(null);
  const sourceRef = useRef(null);

  // Set up / tear down Web Audio AnalyserNode
  useEffect(() => {
    if (isRecording && audioStream) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        audioCtxRef.current = ctx;

        const source = ctx.createMediaStreamSource(audioStream);
        sourceRef.current = source;

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128; // gives 64 bins → plenty for 40 bars
        analyser.smoothingTimeConstant = 0.75;
        source.connect(analyser);
        analyserRef.current = analyser;
      } catch (err) {
        console.error('[WaveformBar] AudioContext error:', err);
      }
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      sourceRef.current?.disconnect();
      sourceRef.current = null;
      analyserRef.current = null;
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
      audioCtxRef.current = null;
    };
  }, [isRecording, audioStream]);

  // Animation loop
  const draw = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    const step = Math.max(1, Math.floor(dataArray.length / BAR_COUNT));

    for (let i = 0; i < BAR_COUNT; i++) {
      const bar = barsRef.current[i];
      if (!bar) continue;
      const value = dataArray[Math.min(i * step, dataArray.length - 1)] / 255;
      const h = Math.max(value * 56, 3);
      bar.style.height = `${h}px`;
      bar.style.opacity = `${0.5 + value * 0.5}`;
    }

    rafRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    if (isRecording && analyserRef.current) {
      draw();
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      // Reset bars to idle height
      barsRef.current.forEach((bar) => {
        if (bar) {
          bar.style.height = '';
          bar.style.opacity = '';
        }
      });
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isRecording, draw]);

  return (
    <div className="waveform-container">
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <div
          key={i}
          ref={(el) => (barsRef.current[i] = el)}
          className={`waveform-bar ${!isRecording ? 'waveform-bar-idle' : ''}`}
          style={{
            backgroundColor: emotionColor,
            animationDelay: !isRecording ? `${(i * 0.07) % 1.2}s` : undefined,
          }}
        />
      ))}
    </div>
  );
}
