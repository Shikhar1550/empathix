import { useEffect, useRef } from 'react';

export default function CursorGlow() {
  const ref = useRef(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    let frame = 0;

    const move = (event) => {
      tx = event.clientX;
      ty = event.clientY;
    };

    const loop = () => {
      x += (tx - x) * 0.15;
      y += (ty - y) * 0.15;
      element.style.transform = `translate3d(${x - 200}px, ${y - 200}px, 0)`;
      frame = requestAnimationFrame(loop);
    };

    window.addEventListener('mousemove', move);
    frame = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('mousemove', move);
      cancelAnimationFrame(frame);
    };
  }, []);

  return <div ref={ref} className="cursor-glow" />;
}
