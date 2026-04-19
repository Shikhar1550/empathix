import { useMemo } from 'react';
import { useReveal } from '../hooks/useReveal';

export default function Reveal({
  children,
  variant = 'up',
  delay = 0,
  className = '',
  as = 'div',
}) {
  const { ref, visible } = useReveal();
  const Component = as;

  const initial = useMemo(() => ({
    up: 'translateY(40px)',
    down: 'translateY(-40px)',
    left: 'translateX(-40px)',
    right: 'translateX(40px)',
    scale: 'scale(0.92)',
    blur: 'translateY(20px)',
  }), []);

  const style = {
    opacity: visible ? 1 : 0,
    transform: visible ? 'none' : initial[variant],
    filter: visible ? 'blur(0)' : variant === 'blur' ? 'blur(12px)' : 'none',
    transition: `opacity 0.9s cubic-bezier(0.22,1,0.36,1) ${delay}s, transform 0.9s cubic-bezier(0.22,1,0.36,1) ${delay}s, filter 0.9s ease ${delay}s`,
    willChange: 'opacity, transform, filter',
  };

  return (
    <Component ref={ref} style={style} className={className}>
      {children}
    </Component>
  );
}
