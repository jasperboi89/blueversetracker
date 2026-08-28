/**
 * Account Cortex service — default wiring for the per-account world model.
 *
 * Composes two canonical systems without duplicating either: the durable Event
 * Ledger (temporal aggregate) and the Account Context Pack (bounded current
 * facts). It owns no data of its own.
 */
import { getAccountAggregate } from "./event-ledger";
import {
  buildAccountWorldModel,
  deriveFactsFromPack,
  type AccountWorldModel,
} from "./account-cortex";
import { getAccountContext } from "./account-context-service";
import type { AccountContextPack } from "./account-context";

/**
 * Build the world model for an account number. Fetches the (cached) Account
 * Context Pack for current facts; if that fails, a ledger-only model is still
 * returned so the surface degrades gracefully.
 */
export async function getAccountWorldModel(
  accountId: string,
  now: number = Date.now(),
): Promise<AccountWorldModel> {
  const aggregate = getAccountAggregate(accountId, now);
  try {
    const pack = await getAccountContext(accountId);
    return buildAccountWorldModel({ accountId, now, aggregate, facts: deriveFactsFromPack(pack) });
  } catch {
    return buildAccountWorldModel({
      accountId,
      now,
      aggregate,
      facts: {
        activeTickets: 0,
        verifiedResolutions: 0,
        recurringActive: false,
        recurring30d: 0,
        warnings: 0,
      },
    });
  }
}

/**
 * Synchronous variant for callers that already hold an Account Context Pack
 * (e.g. Copilot's context assembly) — avoids a redundant re-fetch.
 */
export function worldModelFromPack(
  pack: AccountContextPack,
  now: number = Date.now(),
): AccountWorldModel {
  const accountId = pack.account.accountNumber;
  return buildAccountWorldModel({
    accountId,
    now,
    aggregate: getAccountAggregate(accountId, now),
    facts: deriveFactsFromPack(pack),
  });
}
