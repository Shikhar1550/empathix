import { useEffect, useState } from "react";

export function ScrollProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      setP(h > 0 ? (window.scrollY / h) * 100 : 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div className="fixed left-0 top-0 z-[60] h-[3px] w-full bg-transparent">
      <div
        className="h-full bg-gradient-to-r from-primary via-cyan to-accent shadow-[0_0_12px_oklch(0.78_0.18_220/0.8)] transition-[width] duration-100"
        style={{ width: `${p}%` }}
      />
    </div>
  );
}
