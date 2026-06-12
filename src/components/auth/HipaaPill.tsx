export function HipaaPill() {
  return (
    <div
      className="hidden items-center rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-[0.2em] sm:inline-flex"
      style={{
        color: "var(--cyan-glow)",
        background: "oklch(0.4 0.16 240 / 0.18)",
        border: "1px solid oklch(0.55 0.2 240 / 0.3)",
      }}
      title="HIPAA-Safeguarded · Internal Use"
    >
      HIPAA-Safeguarded · Internal Use
    </div>
  );
}