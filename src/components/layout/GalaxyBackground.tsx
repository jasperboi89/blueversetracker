export function GalaxyBackground() {
  // Lightweight star field using CSS only — fixed behind app
  const stars = Array.from({ length: 60 }, (_, i) => i);
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{ background: "var(--gradient-galaxy)" }}
    >
      {stars.map((i) => {
        const top = (i * 53) % 100;
        const left = (i * 37) % 100;
        const size = (i % 3) + 1;
        const delay = (i % 9) * 0.4;
        return (
          <span
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              top: `${top}%`,
              left: `${left}%`,
              width: `${size}px`,
              height: `${size}px`,
              opacity: 0.3,
              filter: "blur(0.5px)",
              animation: `twinkle ${3 + (i % 5)}s ease-in-out ${delay}s infinite`,
              boxShadow: i % 7 === 0 ? "0 0 6px oklch(0.85 0.16 210 / 0.8)" : undefined,
            }}
          />
        );
      })}
      {/* drifting nebula */}
      <div
        className="absolute -top-40 left-1/3 h-[700px] w-[700px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, oklch(0.5 0.2 280 / 0.18), transparent 60%)",
          filter: "blur(40px)",
        }}
      />
      <div
        className="absolute bottom-0 right-0 h-[600px] w-[600px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, oklch(0.55 0.2 220 / 0.18), transparent 60%)",
          filter: "blur(40px)",
        }}
      />
    </div>
  );
}