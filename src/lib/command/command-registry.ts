/**
 * Operational command registry — the extension seam for the Command Palette.
 *
 * The palette (`src/components/command/CommandPalette.tsx`) already ships the
 * canonical universal-command primitives: page navigation, account/ticket
 * search, Freshdesk pull, Copilot access and theme actions. This registry is
 * the seam where FUTURE phases attach natural-language and operational
 * commands — e.g. "what did we fix on 7022?", "show cancellation tickets",
 * "find similar problems", "show my active programming work",
 * "ask Copilot about this account".
 *
 * Phase 1 intentionally ships NO providers. Nothing here fabricates
 * intelligence: the registry is empty, so the palette renders no extra items
 * until a real provider is registered. This keeps the contract stable so later
 * phases can add capabilities without touching the palette component itself.
 *
 * A provider stays deterministic and side-effect-free during `match`; any
 * effect happens in a command's `run`, which receives a bounded context object
 * rather than reaching into stores directly.
 */

export interface OperationalCommandContext {
  /** The raw text the operator typed. */
  query: string;
  /** Navigate to an in-app route (string form; the palette adapts it). */
  navigate: (to: string) => void;
  /** Open Intel Copilot, optionally seeding it with a prompt. */
  openCopilot: (prompt?: string) => void;
  /** Close the palette after a command runs. */
  close: () => void;
}

export interface OperationalCommand {
  id: string;
  title: string;
  /** Short right-aligned hint (group, shortcut, or affordance). */
  hint?: string;
  /** Extra terms cmdk can match against beyond the title. */
  keywords?: string[];
  /** Executed when the operator selects the command. */
  run: (ctx: OperationalCommandContext) => void | Promise<void>;
}

export interface OperationalCommandProvider {
  id: string;
  /**
   * Return the commands this provider offers for the current query. Must be
   * pure and fast — no network, no store mutation. Return `[]` when nothing
   * matches. Future NL providers can classify `query` here and surface intent-
   * shaped commands whose `run` routes to Copilot, search, or a governed action.
   */
  match: (query: string, ctx: OperationalCommandContext) => OperationalCommand[];
}

const providers: OperationalCommandProvider[] = [];

/** Register a provider. Idempotent by id, so hot-reload can't double-register. */
export function registerCommandProvider(provider: OperationalCommandProvider): void {
  const existing = providers.findIndex((p) => p.id === provider.id);
  if (existing >= 0) providers[existing] = provider;
  else providers.push(provider);
}

/** Remove a provider by id. */
export function unregisterCommandProvider(id: string): void {
  const i = providers.findIndex((p) => p.id === id);
  if (i >= 0) providers.splice(i, 1);
}

/**
 * Resolve every registered provider's commands for the current query. Each
 * provider is isolated: one throwing never suppresses the others. Empty until
 * a provider is registered.
 */
export function resolveOperationalCommands(
  query: string,
  ctx: OperationalCommandContext,
): OperationalCommand[] {
  const out: OperationalCommand[] = [];
  for (const provider of providers) {
    try {
      out.push(...provider.match(query, ctx));
    } catch (err) {
      console.warn(`[command-registry] provider ${provider.id} failed`, err);
    }
  }
  return out;
}
