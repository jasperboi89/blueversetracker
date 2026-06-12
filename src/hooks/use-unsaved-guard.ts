import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Lightweight unsaved-changes guard. Returns helpers a parent can wire into
 * close buttons / route changes / dialog onOpenChange. Pair with
 * <UnsavedChangesPrompt /> for a consistent modal.
 */
export function useUnsavedGuard(dirty: boolean) {
  const [prompting, setPrompting] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  // Browser tab close protection
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  /** Wrap any close/navigate action so it prompts when dirty. */
  const guard = useCallback(
    (action: () => void) => {
      if (!dirty) {
        action();
        return;
      }
      pendingActionRef.current = action;
      setPrompting(true);
    },
    [dirty],
  );

  const discardAndContinue = useCallback(() => {
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    setPrompting(false);
    action?.();
  }, []);

  const cancelPrompt = useCallback(() => {
    pendingActionRef.current = null;
    setPrompting(false);
  }, []);

  return { guard, prompting, setPrompting, discardAndContinue, cancelPrompt };
}