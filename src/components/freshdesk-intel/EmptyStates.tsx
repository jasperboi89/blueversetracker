import { Sparkles, AlertTriangle, Loader2 } from "lucide-react";

export function ScanningState() {
  return (
    <div className="glass-panel flex items-center gap-3 p-6 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      Scanning Freshdesk…
    </div>
  );
}

export function EmptyState() {
  return (
    <div className="glass-panel flex items-center gap-3 p-6 text-sm text-muted-foreground">
      <Sparkles className="h-4 w-4" />
      No strong matches found.
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="glass-panel flex items-start gap-3 p-6 text-sm text-rose-200">
      <AlertTriangle className="mt-0.5 h-4 w-4" />
      <div>
        <div className="font-medium">Freshdesk search failed.</div>
        <div className="text-xs text-rose-300/80">{message}</div>
        <div className="mt-1 text-xs text-muted-foreground">Check API settings, permissions, or sync status.</div>
      </div>
    </div>
  );
}