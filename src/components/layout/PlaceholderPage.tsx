import { Rocket } from "lucide-react";

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-2xl pt-20">
      <div className="glass-panel p-10 text-center">
        <div
          className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl"
          style={{
            background: "linear-gradient(135deg, oklch(0.78 0.18 220 / 0.4), oklch(0.7 0.22 295 / 0.4))",
            boxShadow: "var(--shadow-glow-violet)",
          }}
        >
          <Rocket className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This section will be built in a later phase.
        </p>
      </div>
    </div>
  );
}