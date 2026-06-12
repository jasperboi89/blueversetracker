import { ShieldCheck } from "lucide-react";

export function ShieldIcon3D({ size = 76 }: { size?: number }) {
  return (
    <div
      aria-hidden
      className="relative grid place-items-center rounded-2xl"
      style={{
        width: size,
        height: size,
        background:
          "linear-gradient(135deg, oklch(0.78 0.18 220 / 0.55), oklch(0.7 0.22 295 / 0.55))",
        boxShadow:
          "0 0 30px oklch(0.78 0.18 220 / 0.55), inset 0 1px 0 oklch(1 0 0 / 0.25), inset 0 -10px 24px oklch(0.4 0.18 290 / 0.45)",
        border: "1px solid oklch(1 0 0 / 0.1)",
      }}
    >
      <div
        className="absolute inset-0 rounded-2xl"
        style={{
          background:
            "radial-gradient(120% 60% at 50% 0%, oklch(1 0 0 / 0.22), transparent 60%)",
        }}
      />
      <ShieldCheck
        className="relative h-9 w-9 text-white"
        style={{ filter: "drop-shadow(0 0 6px oklch(0.85 0.16 210 / 0.9))" }}
      />
    </div>
  );
}