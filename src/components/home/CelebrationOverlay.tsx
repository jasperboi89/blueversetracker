import { Check } from "lucide-react";

export function CelebrationOverlay({
  title,
  subtitle,
  variant = "shift",
}: {
  title: string;
  subtitle: string;
  variant?: "shift" | "nightplan";
}) {
  const waves = variant === "shift"
    ? ["var(--cyan-glow)", "var(--electric)", "var(--green-glow)", "var(--violet-glow)", "var(--gold-glow)", "var(--pink-glow)"]
    : ["var(--cyan-glow)", "var(--electric)", "var(--violet-glow)", "var(--pink-glow)"];
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center overflow-hidden bg-background/60 backdrop-blur-md">
      {waves.map((c, i) => (
        <span
          key={i}
          className="absolute h-40 w-40 rounded-full"
          style={{
            border: `2px solid ${c}`,
            boxShadow: `0 0 60px ${c}`,
            animation: `celebrate-wave 2.6s ease-out ${i * 0.3}s infinite`,
            opacity: 0.6,
          }}
        />
      ))}
      <div
        className="glass-panel relative px-10 py-8 text-center"
        style={{ boxShadow: "var(--shadow-glow-cyan), var(--shadow-glow-violet)" }}
      >
        <div
          className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full"
          style={{
            background: "linear-gradient(135deg, var(--green-glow), var(--cyan-glow))",
            boxShadow: "0 0 24px var(--green-glow)",
          }}
        >
          <Check className="h-7 w-7 text-background" strokeWidth={3} />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
        <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}