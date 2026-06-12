import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ticketsStore, type SnipCategory } from "@/lib/tickets-store";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";

const categories: SnipCategory[] = ["Before Change", "After Change", "Testing Result", "Error / Issue", "Other"];

export function AddSnipModal({ ticketId, open, onOpenChange }: { ticketId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<SnipCategory>("Other");
  const [label, setLabel] = useState("");
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [isImage, setIsImage] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setName(""); setCategory("Other"); setLabel(""); setDataUrl(null); setIsImage(false);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of items) {
        if (it.type.startsWith("image/")) {
          const file = it.getAsFile();
          if (file) {
            readFile(file);
            e.preventDefault();
            return;
          }
        }
      }
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [open]);

  const readFile = (file: File) => {
    setName((n) => n || file.name);
    setIsImage(file.type.startsWith("image/"));
    const r = new FileReader();
    r.onload = () => setDataUrl(String(r.result));
    r.readAsDataURL(file);
  };

  const save = () => {
    if (!name.trim()) return;
    ticketsStore.addSnip(ticketId, {
      name: name.trim(),
      category,
      label: label.trim() || undefined,
      dataUrl: dataUrl ?? undefined,
      isImage,
    });
    toast.success("Snip saved.");
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="glass-panel border-0 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Snip</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div
            className="grid min-h-[140px] place-items-center rounded-lg border border-dashed border-border/40 bg-white/[0.02] p-4 text-center"
          >
            {dataUrl && isImage ? (
              <div className="relative">
                <img src={dataUrl} alt="snip preview" className="max-h-48 rounded" />
                <button onClick={() => { setDataUrl(null); setIsImage(false); }} className="absolute right-1 top-1 rounded-md bg-black/40 p-1 text-white hover:bg-black/60">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : dataUrl ? (
              <div className="text-sm">{name || "Attached file"}</div>
            ) : (
              <div className="text-xs text-muted-foreground">
                Paste an image (Ctrl/Cmd+V) or
                <Button size="sm" variant="ghost" className="ml-1" onClick={() => inputRef.current?.click()}>
                  <Upload className="mr-1 h-3 w-3" /> upload file
                </Button>
              </div>
            )}
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); }}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Snip name" className="mt-1" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Category</label>
              <Select value={category} onValueChange={(v) => setCategory(v as SnipCategory)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Description / Label (optional)</label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} className="mt-1" placeholder="Short description" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!name.trim()}
            style={{ background: "linear-gradient(110deg, oklch(0.4 0.16 240 / 0.7), oklch(0.4 0.18 290 / 0.55))", border: "1px solid oklch(0.78 0.18 220 / 0.45)" }}
          >Save Snip</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}