import { useRef } from 'react';

export default function MagneticButton({
  children,
  className = '',
  onClick,
  strength = 0.35,
  type = 'button',
}) {
  const ref = useRef(null);

  const handleMove = (event) => {
    const element = ref.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const x = event.clientX - (rect.left + rect.width / 2);
    const y = event.clientY - (rect.top + rect.height / 2);
    element.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
  };

  const reset = () => {
    const element = ref.current;
    if (element) element.style.transform = 'translate(0,0)';
  };

  return (
    <button
      ref={ref}
      type={type}
      onClick={onClick}
      onMouseMove={handleMove}
      onMouseLeave={reset}
      className={`magnetic-button ${className}`}
    >
      {children}
    </button>
  );
}
