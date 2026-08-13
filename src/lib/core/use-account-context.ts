import { useEffect, useState } from "react";
import { eventSpine } from "./event-spine";
import type { AccountContextPack } from "./account-context";
import { getAccountContext, invalidateAccountContext } from "./account-context-service";
import type { GetAccountContextOptions } from "./account-context-service";

export interface UseAccountContextResult {
  pack: AccountContextPack | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * React access to the Account Context Pack. Re-assembles when the Event Spine
 * reports a change for this account.
 */
export function useAccountContext(
  accountNumber: string | undefined,
  options: GetAccountContextOptions = {},
): UseAccountContextResult {
  const [pack, setPack] = useState<AccountContextPack | null>(null);
  const [loading, setLoading] = useState(Boolean(accountNumber));
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const key = JSON.stringify(options ?? {});

  useEffect(() => {
    if (!accountNumber) {
      setPack(null);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    getAccountContext(accountNumber, JSON.parse(key) as GetAccountContextOptions)
      .then((next) => {
        if (!alive) return;
        setPack(next);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Couldn't assemble account context.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [accountNumber, key, nonce]);

  useEffect(() => {
    if (!accountNumber) return;
    return eventSpine.subscribe(() => setNonce((n) => n + 1), { accountId: accountNumber });
  }, [accountNumber]);

  return {
    pack,
    loading,
    error,
    refresh: () => {
      if (accountNumber) invalidateAccountContext(accountNumber);
      setNonce((n) => n + 1);
    },
  };
}
