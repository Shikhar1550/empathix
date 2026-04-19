import { useRef } from 'react';

export default function TiltCard({
  children,
  className = '',
  intensity = 10,
}) {
  const ref = useRef(null);

  const handleMove = (event) => {
    const element = ref.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    const rx = (py - 0.5) * -intensity;
    const ry = (px - 0.5) * intensity;
    element.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(0)`;
    element.style.setProperty('--mx', `${px * 100}%`);
    element.style.setProperty('--my', `${py * 100}%`);
  };

  const reset = () => {
    const element = ref.current;
    if (!element) return;
    element.style.transform = 'perspective(900px) rotateX(0) rotateY(0)';
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={reset}
      className={`tilt-card ${className}`}
      style={{ transformStyle: 'preserve-3d' }}
    >
      {children}
    </div>
  );
}
