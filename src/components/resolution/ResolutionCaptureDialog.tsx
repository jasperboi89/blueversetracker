import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BookmarkCheck, Loader2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { resolutionService } from "@/lib/resolution/resolution-service";
import {
  CONFIDENCE_HELP,
  CONFIDENCE_LABEL,
  RESOLUTION_CONFIDENCES,
  RESOLUTION_LIMITS as L,
  type ResolutionConfidence,
  type ResolutionMemory,
  type ResolutionSourceRefs,
} from "@/lib/resolution/resolution-types";

export interface ResolutionCapturePrefill {
  accountNumber?: string;
  accountName?: string;
  affectedArea?: string;
  source?: ResolutionSourceRefs;
  /** Only ever a short, already-structured operator label — never raw content. */
  problem?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: ResolutionCapturePrefill;
  /** When set, saving creates a replacement and supersedes this record. */
  supersedes?: ResolutionMemory | null;
  onSaved?: (memory: ResolutionMemory) => void;
}

const EMPTY = {
  problem: "",
  rootCause: "",
  resolution: "",
  testing: "",
  rollback: "",
  affectedArea: "",
};

export function ResolutionCaptureDialog({
  open,
  onOpenChange,
  prefill,
  supersedes,
  onSaved,
}: Props) {
  const [fields, setFields] = useState({ ...EMPTY });
  const [confidence, setConfidence] = useState<ResolutionConfidence | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Prefill only safe deterministic labels; never ticket bodies.
    setFields({
      ...EMPTY,
      problem: supersedes?.problem ?? prefill?.problem ?? "",
      rootCause: supersedes?.rootCause ?? "",
      affectedArea: supersedes?.affectedArea ?? prefill?.affectedArea ?? "",
    });
    setConfidence(null);
    setSaving(false);
  }, [open, prefill, supersedes]);

  const set = (key: keyof typeof EMPTY, value: string) =>
    setFields((cur) => ({ ...cur, [key]: value }));

  const save = async () => {
    if (saving) return;
    if (!fields.problem.trim() || !fields.resolution.trim()) {
      toast.error("Problem and resolution are required.");
      return;
    }
    if (!confidence) {
      toast.error("Choose a confidence level.");
      return;
    }
    setSaving(true);
    try {
      const result = await resolutionService.save({
        accountNumber: supersedes?.accountNumber ?? prefill?.accountNumber ?? "",
        accountName: supersedes?.accountName ?? prefill?.accountName ?? "",
        problem: fields.problem,
        rootCause: fields.rootCause,
        resolution: fields.resolution,
        testing: fields.testing,
        rollback: fields.rollback,
        affectedArea: fields.affectedArea,
        confidence,
        source: supersedes?.source ?? prefill?.source ?? {},
        ...(supersedes ? { supersedesId: supersedes.id } : {}),
      });
      toast.success(
        result.duplicate
          ? "This resolution was already captured."
          : supersedes
            ? "Resolution saved — the previous one is now superseded."
            : "Resolution captured.",
      );
      onSaved?.(result.memory);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the resolution.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookmarkCheck className="size-4" />
            {supersedes ? "Replace resolution" : "Capture resolution"}
          </DialogTitle>
          <DialogDescription>
            Concise operational knowledge only — no ticket bodies, conversations, or caller
            details. You confirm the confidence level.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field
            id="res-problem"
            label="Problem"
            required
            max={L.problem}
            value={fields.problem}
            onChange={(v) => set("problem", v)}
            placeholder="On-call rotation not updating after scheduler change"
          />
          <Field
            id="res-cause"
            label="Root cause"
            max={L.rootCause}
            value={fields.rootCause}
            onChange={(v) => set("rootCause", v)}
            placeholder="Scheduler retained stale active rotation"
          />
          <Field
            id="res-resolution"
            label="Resolution"
            required
            rows={3}
            max={L.resolution}
            value={fields.resolution}
            onChange={(v) => set("resolution", v)}
            placeholder="Reinitialized scheduler and reloaded current rotation"
          />
          <Field
            id="res-testing"
            label="Testing / validation"
            max={L.testing}
            value={fields.testing}
            onChange={(v) => set("testing", v)}
            placeholder="Verified correct provider after refresh"
          />
          <Field
            id="res-rollback"
            label="Rollback"
            max={L.rollback}
            value={fields.rollback}
            onChange={(v) => set("rollback", v)}
            placeholder="Restore prior rotation entry"
          />

          <div className="space-y-1">
            <Label htmlFor="res-area" className="text-xs">
              Affected area
            </Label>
            <Input
              id="res-area"
              maxLength={L.affectedArea}
              value={fields.affectedArea}
              onChange={(e) => set("affectedArea", e.target.value)}
              placeholder="on-call scheduling"
            />
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-foreground">Confidence</span>
            <div className="flex flex-wrap gap-2">
              {RESOLUTION_CONFIDENCES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setConfidence(c)}
                  title={CONFIDENCE_HELP[c]}
                  className={`rounded-md border px-3 py-1.5 text-xs transition ${
                    confidence === c
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {CONFIDENCE_LABEL[c]}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {confidence
                ? CONFIDENCE_HELP[confidence]
                : "Pick one — nothing is marked verified for you."}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {supersedes ? "Save replacement" : "Save resolution"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  max,
  rows = 2,
  required,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  rows?: number;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-xs">
          {label}
          {required ? <span className="ml-1 text-destructive">*</span> : null}
        </Label>
        <span className="text-[10px] text-muted-foreground">
          {value.length}/{max}
        </span>
      </div>
      <Textarea
        id={id}
        rows={rows}
        maxLength={max}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
