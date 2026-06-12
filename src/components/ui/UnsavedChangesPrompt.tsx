import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface UnsavedChangesPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
  onSave?: () => void;
  saveLabel?: string;
  discardLabel?: string;
  context?: string;
}

export function UnsavedChangesPrompt({
  open,
  onOpenChange,
  onDiscard,
  onSave,
  saveLabel = "Save & Close",
  discardLabel = "Discard Changes",
  context,
}: UnsavedChangesPromptProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-panel border-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Unsaved Changes</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground">
          {context ? context : "You have unsaved changes. What would you like to do?"}
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:gap-2">
          {onSave && (
            <Button onClick={onSave}>{saveLabel}</Button>
          )}
          <Button variant="ghost" onClick={onDiscard}>{discardLabel}</Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Go Back</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}