import { useEffect } from "react";
import { startRetrievalSync } from "@/lib/retrieval/retrieval-service";

/** Headless: keeps the hybrid retrieval index fresh for this operator. */
export function RetrievalSyncWatcher() {
  useEffect(() => startRetrievalSync(), []);
  return null;
}
