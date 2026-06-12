import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { getGreeting } from "@/lib/shift";
import { useNow } from "@/hooks/use-now";

const rotators = [
  "Tonight's command deck is ready.",
  "BlueVerse systems are online.",
  "Your shift plan is waiting.",
  "Let's keep the night organized.",
  "Galaxy mode engaged.",
];

export function GreetingPanel({ name = "Luke" }: { name?: string }) {
  const now = useNow(60_000);
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % rotators.length), 6000);
    return () => clearInterval(id);
  }, []);
  const greeting = getGreeting(now);

  return (
    <div className="glass-panel shimmer relative overflow-hidden p-5 sm:p-6">
      <div className="flex items-center gap-4">
        <div
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl"
          style={{
            background: "linear-gradient(135deg, oklch(0.78 0.18 220 / 0.45), oklch(0.7 0.22 295 / 0.4))",
            boxShadow: "var(--shadow-glow-cyan)",
          }}
        >
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold leading-tight text-foreground sm:text-2xl">
            {greeting}, {name}.
          </h1>
          <p className="text-sm text-muted-foreground">
            Here's what's on the agenda today!
          </p>
          <div className="mt-2 h-4 overflow-hidden">
            <p
              key={idx}
              className="text-xs text-cyan-glow/90"
              style={{
                color: "var(--cyan-glow)",
                animation: "fade-rotate 6s ease-in-out forwards",
              }}
            >
              {rotators[idx]}
            </p>
          </div>
        </div>
      </div>
      <div
        className="mt-4 h-px w-full"
        style={{
          background:
            "linear-gradient(90deg, transparent, var(--cyan-glow), var(--violet-glow), transparent)",
          opacity: 0.6,
          animation: "pulse-glow 4s ease-in-out infinite",
        }}
      />
    </div>
  );
}