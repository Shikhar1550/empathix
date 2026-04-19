import { ReactNode, useRef } from "react";

export function MagneticButton({
  children,
  className = "",
  onClick,
  strength = 0.35,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  strength?: number;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const handleMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - (r.left + r.width / 2);
    const y = e.clientY - (r.top + r.height / 2);
    el.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
  };
  const reset = () => {
    const el = ref.current;
    if (el) el.style.transform = "translate(0,0)";
  };
  return (
    <button
      ref={ref}
      onClick={onClick}
      onMouseMove={handleMove}
      onMouseLeave={reset}
      className={`transition-transform duration-200 ease-out ${className}`}
    >
      {children}
    </button>
  );
}
