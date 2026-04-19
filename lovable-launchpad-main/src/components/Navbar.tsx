import { useEffect, useState } from "react";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed left-0 right-0 top-0 z-50 transition-all duration-500 ${
        scrolled ? "py-3" : "py-6"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-center px-6">
        <nav
          className={`flex items-center gap-1 rounded-2xl glass px-2 py-2 transition-all`}
        >
          {[
            { label: "Features", href: "#features" },
            { label: "Tech", href: "#tech" },
            { label: "Demo", href: "#demo" },
            { label: "Empathix", href: "#launch" },
          ].map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="rounded-xl px-4 py-2 text-sm text-muted-foreground transition-all hover:bg-primary/10 hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
