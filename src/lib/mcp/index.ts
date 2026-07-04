import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoami from "./tools/whoami";
import listDispatches from "./tools/list-dispatches";
import listTickets from "./tools/list-tickets";
import getNightPlan from "./tools/get-night-plan";
import listAccounts from "./tools/list-accounts";

// Build the OAuth issuer from the Supabase project ref inlined at build time.
// Never use the .lovable.cloud proxy — mcp-js rejects it as an issuer mismatch.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "account-intel-hub-mcp",
  title: "Account Intel Hub",
  version: "0.1.0",
  instructions:
    "Read-only access to the signed-in user's Account Intel Hub data: contact dispatch sessions, Freshdesk tickets they track, saved accounts, and the current shift night plan. Use `whoami` to verify the session, then `list_dispatches`, `list_tickets`, `list_accounts`, or `get_night_plan`.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoami, listDispatches, listTickets, listAccounts, getNightPlan],
});