import { useEffect, useRef } from "react";

const DUST = Array.from({ length: 46 }, (_, i) => ({
  left: (i * 37) % 100,
  top: (i * 61) % 100,
  delay: (i % 13) * 1.4,
  dur: 14 + (i % 7) * 3,
  size: i % 5 === 0 ? 3 : 2,
}));

const STREAKS = [
  { top: "18%", delay: 2, dur: 9, color: "var(--cyan-glow)" },
  { top: "44%", delay: 11, dur: 11, color: "var(--violet-glow)" },
  { top: "72%", delay: 19, dur: 10, color: "var(--electric)" },
];

export function AuthAtmosphere() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const x = (e.clientX / window.innerWidth - 0.5) * 2;
        const y = (e.clientY / window.innerHeight - 0.5) * 2;
        el.style.setProperty("--auth-px", String(x * 18));
        el.style.setProperty("--auth-py", String(y * 18));
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* volumetric light beams */}
      <div
        className="auth-beam auth-parallax left-[8%]"
        style={{
          ["--auth-depth" as string]: 1.4,
          background:
            "linear-gradient(to bottom, transparent, oklch(0.75 0.2 235 / 0.35), transparent)",
          transformOrigin: "top center",
          rotate: "14deg",
          animation: "auth-beam 14s ease-in-out infinite",
        }}
      />
      <div
        className="auth-beam auth-parallax right-[12%]"
        style={{
          ["--auth-depth" as string]: 1.9,
          background:
            "linear-gradient(to bottom, transparent, oklch(0.7 0.22 300 / 0.3), transparent)",
          transformOrigin: "top center",
          rotate: "-11deg",
          animation: "auth-beam 18s ease-in-out 3s infinite",
        }}
      />

      {/* nebula clouds */}
      <div
        className="auth-drift auth-parallax absolute -left-[15%] top-[-10%] h-[70vh] w-[70vh] rounded-full"
        style={{
          ["--auth-depth" as string]: 2.2,
          background:
            "radial-gradient(circle, oklch(0.6 0.2 250 / 0.28), transparent 68%)",
          filter: "blur(70px)",
          animation: "auth-drift 26s ease-in-out infinite",
        }}
      />
      <div
        className="auth-drift auth-parallax absolute -right-[10%] bottom-[-15%] h-[75vh] w-[75vh] rounded-full"
        style={{
          ["--auth-depth" as string]: 2.6,
          background:
            "radial-gradient(circle, oklch(0.62 0.21 300 / 0.24), transparent 68%)",
          filter: "blur(80px)",
          animation: "auth-drift 34s ease-in-out 2s infinite reverse",
        }}
      />
      <div
        className="absolute left-1/2 top-1/2 h-[95vh] w-[95vh] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(circle, oklch(0.7 0.18 220 / 0.12), transparent 62%)",
          filter: "blur(60px)",
          animation: "auth-breathe 12s ease-in-out infinite",
        }}
      />

      {/* holographic grid */}
      <div
        className="auth-grid auth-parallax absolute inset-0 opacity-45"
        style={{ ["--auth-depth" as string]: 0.8 }}
      />

      {/* signal streaks */}
      {STREAKS.map((s, i) => (
        <span
          key={i}
          className="absolute h-px w-[26vw] rounded-full"
          style={{
            top: s.top,
            background: `linear-gradient(90deg, transparent, ${s.color}, transparent)`,
            filter: "blur(0.4px)",
            opacity: 0,
            animation: `auth-streak ${s.dur}s cubic-bezier(0.4,0,0.2,1) ${s.delay}s infinite`,
          }}
        />
      ))}

      {/* orbital arcs */}
      <div
        className="absolute left-1/2 top-1/2 h-[120vh] w-[120vh] rounded-full"
        style={{
          border: "1px solid oklch(0.8 0.14 215 / 0.09)",
          maskImage: "linear-gradient(120deg, black, transparent 55%)",
          animation: "auth-ring-sweep 90s linear infinite",
        }}
      />
      <div
        className="absolute left-1/2 top-1/2 h-[78vh] w-[78vh] rounded-full"
        style={{
          border: "1px solid oklch(0.72 0.2 295 / 0.1)",
          maskImage: "linear-gradient(300deg, black, transparent 60%)",
          animation: "auth-ring-sweep 140s linear infinite reverse",
        }}
      />
      <div
        className="absolute left-1/2 top-1/2 h-[52vh] w-[52vh] rounded-full"
        style={{
          border: "1px dashed oklch(0.85 0.16 210 / 0.12)",
          maskImage: "linear-gradient(220deg, black, transparent 62%)",
          animation: "auth-ring-sweep 62s linear infinite",
        }}
      />

      {/* signal traces */}
      <div
        className="auth-scanline absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, oklch(0.85 0.16 210 / 0.5), transparent)",
          animation: "auth-scan 18s linear infinite",
        }}
      />
      <div
        className="auth-scanline absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, oklch(0.72 0.2 295 / 0.45), transparent)",
          animation: "auth-scan 26s linear 6s infinite",
        }}
      />

      {/* luminous dust */}
      {DUST.map((d, i) => (
        <span
          key={i}
          className="auth-dust absolute rounded-full"
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: d.size,
            height: d.size,
            background: i % 3 === 0 ? "var(--violet-glow)" : "var(--cyan-glow)",
            boxShadow: "0 0 8px currentColor",
            animation: `auth-dust ${d.dur}s linear ${d.delay}s infinite`,
          }}
        />
      ))}

      {/* vignette for depth */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 45%, transparent 40%, oklch(0.06 0.03 270 / 0.75) 100%)",
        }}
      />
    </div>
  );
}
