import { useEffect, useRef } from "react";

export function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let tx = 0, ty = 0, x = 0, y = 0, raf = 0;
    const move = (e: MouseEvent) => {
      tx = e.clientX;
      ty = e.clientY;
    };
    const loop = () => {
      x += (tx - x) * 0.15;
      y += (ty - y) * 0.15;
      el.style.transform = `translate3d(${x - 200}px, ${y - 200}px, 0)`;
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener("mousemove", move);
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("mousemove", move);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div
      ref={ref}
      className="pointer-events-none fixed left-0 top-0 z-[1] hidden h-[400px] w-[400px] rounded-full md:block"
      style={{
        background:
          "radial-gradient(circle, oklch(0.78 0.18 220 / 0.18), transparent 60%)",
        mixBlendMode: "screen",
      }}
    />
  );
}
