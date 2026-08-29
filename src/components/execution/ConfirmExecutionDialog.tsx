import { useEffect, useState } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { describePlan } from "@/lib/execution/execution-plan";
import { mintConfirmation, requiredPhrase } from "@/lib/execution/confirmation";
import type { ConfirmationProof, ExecutionPlan } from "@/lib/execution/execution-contract";

/**
 * Human confirmation UX (Phase 10).
 *
 * The dialog never says "done" — it states exactly what WILL change, and the
 * operator's action is what mints the proof. Nothing here can be triggered by
 * model output.
 */
export function ConfirmExecutionDialog({
  plan,
  operatorRef,
  open,
  onOpenChange,
  onConfirmed,
}: {
  plan: ExecutionPlan | null;
  operatorRef: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmed: (proof: ConfirmationProof) => void;
}) {
  const [phrase, setPhrase] = useState("");
  const [second, setSecond] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setPhrase("");
      setSecond("");
      setError("");
    }
  }, [open, plan?.fingerprint]);

  if (!plan) return null;

  const needsPhrase = plan.confirmation === "typed" || plan.confirmation === "dual";
  const needsSecond = plan.confirmation === "dual";
  const highRisk = plan.riskClass === "high" || plan.riskClass === "critical";

  const submit = () => {
    const res = mintConfirmation({
      plan,
      operatorRef,
      ...(needsPhrase ? { typedPhrase: phrase } : {}),
      ...(needsSecond ? { secondOperatorRef: second.trim() } : {}),
    });
    if (!res.ok) {
      setError(res.message);
      return;
    }
    onConfirmed(res.proof);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {highRisk ? (
              <AlertTriangle className="h-4 w-4 text-destructive" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-primary" />
            )}
            Apply this change?
          </DialogTitle>
          <DialogDescription>
            Nothing has been changed yet. This is exactly what will happen if you continue.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-1 rounded-md border border-border/50 bg-muted/30 p-3 text-sm">
          {describePlan(plan).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>

        <p className="text-xs text-muted-foreground">
          Reference {plan.fingerprint} · confirmation level {plan.confirmation}. If anything about
          this change is edited afterwards, this confirmation stops being valid.
        </p>

        {needsPhrase && (
          <div className="space-y-1.5">
            <Label htmlFor="confirm-phrase">
              Type <span className="font-mono">{requiredPhrase(plan)}</span> to continue
            </Label>
            <Input id="confirm-phrase" value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" />
          </div>
        )}

        {needsSecond && (
          <div className="space-y-1.5">
            <Label htmlFor="confirm-second">Second operator</Label>
            <Input
              id="confirm-second"
              value={second}
              onChange={(e) => setSecond(e.target.value)}
              placeholder="Who else is confirming this?"
              autoComplete="off"
            />
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant={highRisk ? "destructive" : "default"} onClick={submit}>
            Confirm and apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
