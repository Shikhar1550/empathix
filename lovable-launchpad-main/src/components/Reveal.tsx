import { ReactNode, CSSProperties, ElementType } from "react";
import { useReveal } from "@/hooks/useReveal";

type Variant = "up" | "down" | "left" | "right" | "scale" | "blur";

export function Reveal({
  children,
  variant = "up",
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  variant?: Variant;
  delay?: number;
  className?: string;
  as?: ElementType;
}) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  const initial: Record<Variant, string> = {
    up: "translateY(40px)",
    down: "translateY(-40px)",
    left: "translateX(-40px)",
    right: "translateX(40px)",
    scale: "scale(0.92)",
    blur: "translateY(20px)",
  };
  const style: CSSProperties = {
    opacity: visible ? 1 : 0,
    transform: visible ? "none" : initial[variant],
    filter: visible ? "blur(0)" : variant === "blur" ? "blur(12px)" : "none",
    transition: `opacity 0.9s cubic-bezier(0.22,1,0.36,1) ${delay}s, transform 0.9s cubic-bezier(0.22,1,0.36,1) ${delay}s, filter 0.9s ease ${delay}s`,
    willChange: "opacity, transform, filter",
  };
  return (
    <Tag ref={ref} style={style} className={className}>
      {children}
    </Tag>
  );
}
