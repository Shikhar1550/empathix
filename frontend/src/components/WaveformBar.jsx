import { useEffect, useRef } from 'react';

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  const normalized = value.length === 3
    ? value.split('').map((char) => `${char}${char}`).join('')
    : value;

  const numeric = Number.parseInt(normalized, 16);
  return {
    r: (numeric >> 16) & 255,
    g: (numeric >> 8) & 255,
    b: numeric & 255,
  };
}

export default function WaveformBar({
  isRecording = false,
  analyserNode = null,
  emotionColor = '#7a3cff',
}) {
  const canvasRef = useRef(null);
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const context = canvas.getContext('2d');
    if (!context) return undefined;

    const fit = () => {
      const width = canvas.clientWidth || 280;
      const height = 38;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      const width = canvas.clientWidth || 280;
      const height = 38;
      const { r, g, b } = hexToRgb(emotionColor);

      context.clearRect(0, 0, width, height);

      if (!analyserNode || !isRecording) {
        context.strokeStyle = `rgba(${r},${g},${b},0.28)`;
        context.lineWidth = 1.4;
        context.beginPath();

        for (let x = 0; x < width; x += 1) {
          const y = height / 2 + Math.sin(x / 16 + performance.now() * 0.01) * 1.8;
          if (x === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }

        context.stroke();
        frameRef.current = requestAnimationFrame(draw);
        return;
      }

      const data = new Uint8Array(analyserNode.frequencyBinCount);
      analyserNode.getByteTimeDomainData(data);

      context.strokeStyle = `rgba(${r},${g},${b},0.95)`;
      context.lineWidth = 1.6;
      context.shadowBlur = 8;
      context.shadowColor = emotionColor;
      context.beginPath();

      const step = data.length / width;
      for (let x = 0; x < width; x += 1) {
        const value = data[Math.floor(x * step)] / 128;
        const y = value * (height / 2) + height / 4;
        if (x === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }

      context.stroke();
      context.shadowBlur = 0;
      frameRef.current = requestAnimationFrame(draw);
    };

    fit();
    frameRef.current = requestAnimationFrame(draw);
    window.addEventListener('resize', fit);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', fit);
    };
  }, [analyserNode, emotionColor, isRecording]);

  return <canvas ref={canvasRef} className="waveform-canvas" aria-hidden="true" />;
}
