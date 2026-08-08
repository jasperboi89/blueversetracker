import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { additionalWorkStore } from "@/lib/additional-work-store";
import { cn } from "@/lib/utils";

export function DeleteWorkButton({
  workId,
  title,
  label,
  className,
  onDeleted,
}: {
  workId: string;
  title?: string;
  label?: string;
  className?: string;
  onDeleted?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        size={label ? "default" : "sm"}
        variant="ghost"
        className={cn("text-destructive hover:text-destructive", className)}
        aria-label="Delete task"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Trash2 className={cn("h-4 w-4", label && "mr-1.5")} />
        {label}
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              {title ? `"${title}" ` : "This additional work item "}
              will be permanently removed. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                additionalWorkStore.remove(workId);
                toast.success("Task deleted");
                setOpen(false);
                onDeleted?.();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}