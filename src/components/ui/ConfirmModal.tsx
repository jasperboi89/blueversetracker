import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";

export type ConfirmTone = "default" | "danger" | "success";

export interface ConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
}

const toneAccent: Record<ConfirmTone, string> = {
  default: "var(--cyan-glow)",
  danger: "oklch(0.72 0.22 25)",
  success: "var(--green-glow)",
};

export function ConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  onConfirm,
  loading,
}: ConfirmModalProps) {
  const accent = toneAccent[tone];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-panel border-0 sm:max-w-md">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[var(--radius)]"
          style={{
            boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${accent} 35%, transparent), 0 0 30px color-mix(in oklab, var(--violet-glow) 25%, transparent)`,
          }}
        />
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span
              className="grid h-7 w-7 place-items-center rounded-lg"
              style={{
                background: `color-mix(in oklab, ${accent} 18%, transparent)`,
                boxShadow: `0 0 14px color-mix(in oklab, ${accent} 50%, transparent)`,
              }}
            >
              <AlertTriangle className="h-3.5 w-3.5" style={{ color: accent }} />
            </span>
            {title}
          </DialogTitle>
        </DialogHeader>
        {description && (
          <div className="text-sm text-muted-foreground">{description}</div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            onClick={() => onConfirm()}
            disabled={loading}
            style={
              tone === "danger"
                ? { background: accent, color: "white" }
                : tone === "success"
                  ? { background: "var(--green-glow)", color: "#04150a" }
                  : undefined
            }
          >
            {loading ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}