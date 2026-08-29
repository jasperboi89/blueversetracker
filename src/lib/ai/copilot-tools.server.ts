// Server-only read tools the Intel Copilot can call. Every tool reads the
// signed-in user's own cloud blobs through their RLS-scoped client, so a
// tool can never reach another operator's data.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResponsesTool } from "./ai-client.server";

type Row = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

/** Strict-mode schema helper: every property required, optionals nullable. */
function schema(props: Record<string, unknown>): Record<string, unknown> {
  return {
    type: "object",
    properties: props,
    required: Object.keys(props),
    additionalProperties: false,
  };
}
const nullableString = { type: ["string", "null"] };

export const COPILOT_TOOLS: ResponsesTool[] = [
  {
    type: "function",
    name: "search_tickets",
    strict: true,
    description:
      "Search the operator's tracked Freshdesk tickets. status: working | waiting-cs | waiting-prog | completed | all. query matches subject, ticket number, or account. Pass null to skip a filter.",
    parameters: schema({
      status: nullableString,
      accountNumber: nullableString,
      query: nullableString,
    }),
  },
  {
    type: "function",
    name: "get_ticket",
    strict: true,
    description:
      "Get one tracked ticket in detail by ticket number: subject, status, classification, issue/changes/result text, and recent Freshdesk notes.",
    parameters: schema({ number: { type: "string" } }),
  },
  {
    type: "function",
    name: "list_accounts",
    strict: true,
    description: "List or search saved accounts by number or name. Pass null for all.",
    parameters: schema({ query: nullableString }),
  },
  {
    type: "function",
    name: "account_history",
    strict: true,
    description:
      "All tracked tickets and logged work time for one account number — use this for recurring-issue questions.",
    parameters: schema({ accountNumber: { type: "string" } }),
  },
  {
    type: "function",
    name: "get_night_plan",
    strict: true,
    description: "The current shift Night Plan items with priority and status.",
    parameters: schema({}),
  },
  {
    type: "function",
    name: "get_dispatches",
    strict: true,
    description: "Contact Dispatch sessions with their status and account.",
    parameters: schema({ status: nullableString }),
  },
  {
    type: "function",
    name: "get_work_time",
    strict: true,
    description:
      "Logged work-timer sessions (what was worked, for how long, on which account) within the last N hours. Pass null for 24.",
    parameters: schema({ sinceHours: { type: ["number", "null"] } }),
  },
  {
    type: "function",
    name: "propose_action",
    strict: true,
    description:
      "Propose ONE change for the operator to confirm. Nothing is applied until they tap Apply. kind: add_night_plan_item | complete_night_plan_item | set_ticket_classification | start_timer. " +
      "add_night_plan_item needs task (+ optional notes, priority must|important|normal). complete_night_plan_item needs task (matched against existing plan items). " +
      "set_ticket_classification needs ticketNumber and classification ('Scripting Issue' | 'Client Change' | 'Other'). start_timer needs ticketNumber. " +
      "Always look the data up first, then propose. Pass null for fields that do not apply.",
    parameters: schema({
      kind: { type: "string" },
      task: nullableString,
      notes: nullableString,
      priority: nullableString,
      ticketNumber: nullableString,
      classification: nullableString,
      reason: { type: "string" },
    }),
  },
  {
    type: "function",
    name: "search_operational_knowledge",
    strict: true,
    description:
      "Hybrid search (keyword + meaning) over the operator's own resolutions, change records, runbooks and knowledge notes. Use for 'have we seen this before', 'how did we fix X', or before proposing a fix. Every result carries its source and confidence — cite them and never present a result as verified unless it says verified. Pass null to skip a filter.",
    parameters: schema({
      query: { type: "string" },
      accountNumber: nullableString,
      includeHistorical: { type: ["boolean", "null"] },
    }),
  },
  {
    type: "function",
    name: "operational_anomalies",
    strict: true,
    description:
      "Deviations from an account's established operational baseline (activity volume, issue mix, quiet-to-active shifts, work duration, reopen/escalation drift, recurrence spacing, post-change activity). " +
      "Results are deviation statements only — never causes and never predictions. Anything returned under baselineGaps means there is NOT enough history to judge: say the baseline is still forming rather than implying behavior is normal. " +
      "Pass null for accountNumber to see every account with a recorded deviation.",
    parameters: schema({ accountNumber: nullableString }),
  },
  {
    type: "function",
    name: "operational_forecast",
    strict: true,
    description:
      "Outlook for an account based on how HISTORICALLY COMPARABLE states of that same account resolved afterwards. " +
      "Each item states an interpretable band (lower than usual / typical / elevated / highly elevated), an explicit outcome window, and how many comparable states it rests on. " +
      "These are NOT probabilities, NOT certainties, and NOT causes — say 'comparable past states were more often followed by X' and never 'this will happen' or 'this is because'. " +
      "Items under evidenceGaps mean the system declined to forecast: report insufficient forecast evidence rather than implying low risk. " +
      "You may explain and recommend preparation; you may never act on a forecast. Pass null for accountNumber to see every account with a recorded outlook.",
    parameters: schema({ accountNumber: nullableString }),
  },
  {
    type: "function",
    name: "operational_investigation",
    strict: true,
    description:
      "Open causal investigations for an account: the competing explanations under consideration, the evidence for and AGAINST each, prepared discriminating tests, and the current conclusion. " +
      "Report contradictions and counterexamples FIRST, before supporting evidence. " +
      "A hypothesis is a candidate explanation, never a confirmed cause: say 'one explanation consistent with the evidence', 'associated with', or 'temporally related to' — never 'caused by', 'because of', 'due to' or 'the root cause is'. " +
      "Only a hypothesis whose status is 'verified' may be described as established, and even then only under the conditions actually tested. " +
      "When the conclusion is insufficient_evidence or multiple_plausible_explanations, say so plainly and name the next discriminating test instead of picking a favourite. " +
      "You may explain, compare and recommend a test; you may never run a test, change a script, or act on a hypothesis. Pass null for accountNumber to see every investigation.",
    parameters: schema({ accountNumber: nullableString }),
  },
  {
    type: "function",
    name: "script_structure",
    strict: true,
    description:
      "Structural analysis of one saved IS script: component and branch counts, dependency edges, unresolved targets, loops, complexity band and drivers, plus constructs the extractor could not classify. Returns structure only — never script source. Coverage below 0.6 means the reading is partial: say so instead of asserting how the script behaves. Match a script by title text.",
    parameters: schema({ title: { type: "string" } }),
  },
];

async function readBlob(
  supabase: SupabaseClient,
  userId: string,
  storeKey: string,
): Promise<Row> {
  const { data, error } = await supabase
    .from("user_store_blobs")
    .select("data")
    .eq("user_id", userId)
    .eq("store_key", storeKey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return ((data?.data as Row | null) ?? {}) as Row;
}

function arr(blob: Row, key: string): Row[] {
  const v = blob[key];
  return Array.isArray(v) ? (v as Row[]) : [];
}

function ticketSummary(t: Row): Row {
  const details = (t["details"] as Row | undefined) ?? {};
  return {
    number: str(t["number"]),
    account: `${str(t["accountNumber"])} ${str(t["accountName"])}`.trim(),
    status: str(t["status"]),
    subject: str(details["subject"]),
    dueAt: t["dueAt"] ?? null,
    updatedAt: num(t["updatedAt"]),
    classification: t["issueClassification"] ?? null,
  };
}

/**
 * Execute one Copilot tool call. Results are compact so the model can read
 * many of them without blowing the context.
 */
export async function runCopilotTool(
  supabase: SupabaseClient,
  userId: string,
  name: string,
  rawArgs: unknown,
): Promise<unknown> {
  const args = (rawArgs ?? {}) as Row;

  switch (name) {
    case "search_operational_knowledge": {
      const { searchKnowledge } = await import("@/lib/retrieval/retrieval.server");
      const account = str(args["accountNumber"]);
      const res = await searchKnowledge(supabase as never, {
        query: str(args["query"]).slice(0, 400),
        ...(account ? { accountNumber: account } : {}),
        includeHistorical: args["includeHistorical"] === true,
        limit: 6,
      });
      return {
        mode: res.modeUsed,
        warnings: res.warnings,
        // Retrieval results are evidence, not answers: keep provenance attached.
        results: res.results.map((r) => ({
          source: r.sourceType,
          sourceId: r.sourceId,
          title: r.title,
          snippet: r.snippet,
          account: r.accountNumber ?? null,
          confidence: r.confidence ?? null,
          status: r.sourceStatus ?? null,
          matchedBy: r.matchedBy,
          updatedAt: r.sourceUpdatedAt ?? null,
        })),
      };
    }

    case "operational_anomalies": {
      const blob = await readBlob(supabase, userId, "account-anomalies");
      const byAccount = (blob["byAccount"] as Record<string, Row> | undefined) ?? {};
      const wanted = str(args["accountNumber"]).trim();
      const records = Object.values(byAccount).filter((r) =>
        wanted ? str(r["accountId"]) === wanted : true,
      );
      const flatten = (r: Row, key: string) =>
        (Array.isArray(r[key]) ? (r[key] as Row[]) : []).map((a) => {
          const baseline = (a["baseline"] as Row | undefined) ?? {};
          const deviation = (a["deviation"] as Row | undefined) ?? {};
          return {
            account: str(r["accountId"]),
            type: str(a["anomalyType"]),
            state: str(a["state"]),
            title: str(a["title"]),
            description: str(a["description"]).slice(0, 600),
            severity: str(a["severity"]),
            confidence: str(a["confidence"]),
            observed: deviation["observed"] ?? null,
            baselineMedian: baseline["median"] ?? null,
            metric: str(baseline["metric"]),
            samples: baseline["sampleCount"] ?? null,
            robustZ: deviation["robustZ"] ?? null,
            reason: a["insufficientReason"] ?? null,
            lastObserved: str(a["lastObservedAt"]),
          };
        });
      const anomalies = records.flatMap((r) => flatten(r, "anomalies")).slice(0, 20);
      const baselineGaps = records.flatMap((r) => flatten(r, "baselineGaps")).slice(0, 20);
      return {
        anomalies,
        baselineGaps,
        interpretation:
          "Anomalies describe deviation from a robust (median/MAD) baseline. They are not causal and not predictive. " +
          "baselineGaps mean the system cannot judge deviation yet — report that as 'baseline still forming', never as 'normal'.",
      };
    }

    case "operational_investigation": {
      const blob = await readBlob(supabase, userId, "investigations");
      const byId = (blob["byId"] as Record<string, Row> | undefined) ?? {};
      const wanted = str(args["accountNumber"]).trim();
      const records = Object.values(byId).filter((r) =>
        wanted ? str(r["accountId"]) === wanted : true,
      );
      const investigations = records.slice(0, 10).map((inv) => {
        const evidence = Array.isArray(inv["evidence"]) ? (inv["evidence"] as Row[]) : [];
        const tests = Array.isArray(inv["tests"]) ? (inv["tests"] as Row[]) : [];
        const conclusion = (inv["conclusion"] as Row | undefined) ?? {};
        return {
          account: str(inv["accountId"]),
          title: str(inv["title"]).slice(0, 200),
          status: str(inv["status"]),
          conclusion: str(conclusion["kind"]),
          conclusionSummary: str(conclusion["summary"]).slice(0, 400),
          nextStep: str(conclusion["nextStep"]).slice(0, 300),
          autonomy: str(inv["autonomy"]),
          hypotheses: (Array.isArray(inv["hypotheses"]) ? (inv["hypotheses"] as Row[]) : [])
            .slice(0, 8)
            .map((h) => ({
              id: str(h["id"]),
              title: str(h["title"]).slice(0, 200),
              type: str(h["hypothesisType"]),
              status: str(h["status"]),
              strength: str(h["strength"]),
              relationClaim: str(h["relationClaim"]),
              // Contradicting evidence is listed first, deliberately.
              contradictedBy: evidence
                .filter((e) => str(e["hypothesisId"]) === str(h["id"]) && str(e["stance"]) === "contradicts")
                .map((e) => str(e["statement"]).slice(0, 240)),
              supportedBy: evidence
                .filter((e) => str(e["hypothesisId"]) === str(h["id"]) && str(e["stance"]) === "supports")
                .map((e) => str(e["statement"]).slice(0, 240)),
            })),
          preparedTests: tests.slice(0, 6).map((t) => ({
            title: str(t["title"]).slice(0, 200),
            utility: str(((t["utility"] as Row | undefined) ?? {})["klass"]),
            status: str(t["status"]),
            outcome: str(((t["result"] as Row | undefined) ?? {})["outcomeKey"]),
          })),
        };
      });
      return {
        investigations,
        interpretation:
          "These are candidate explanations under investigation, not established causes. Present contradicting evidence before supporting evidence. " +
          "Never use causal language for a hypothesis that is not status 'verified'; use 'associated with' or 'one explanation consistent with the evidence'. " +
          "insufficient_evidence and multiple_plausible_explanations are honest answers — report them and name the next discriminating test. " +
          "Autonomy is capped at prepare: you may explain and recommend a test, never run one or change a script.",
      };
    }

    case "operational_forecast": {
      const blob = await readBlob(supabase, userId, "account-forecasts");
      const byAccount = (blob["byAccount"] as Record<string, Row> | undefined) ?? {};
      const wanted = str(args["accountNumber"]).trim();
      const records = Object.values(byAccount).filter((r) =>
        wanted ? str(r["accountId"]) === wanted : true,
      );
      const flatten = (r: Row, key: string) =>
        (Array.isArray(r[key]) ? (r[key] as Row[]) : []).map((f) => {
          const o = (f["outcomes"] as Row | undefined) ?? {};
          return {
            account: str(r["accountId"]),
            type: str(f["forecastType"]),
            band: str(f["band"]),
            confidence: str(f["confidence"]),
            trend: str(f["trend"]),
            outcomeWindow: str(f["horizon"]),
            targetOutcome: str(f["targetOutcome"]),
            title: str(f["title"]),
            description: str(f["description"]).slice(0, 600),
            comparableStates: o["comparableCount"] ?? null,
            observedWindows: o["observedCount"] ?? null,
            outcomeOccurred: o["occurredCount"] ?? null,
            insufficientReason: f["insufficientReason"] ?? null,
            whatThisDoesNotMean: str(f["whatThisDoesNotMean"]),
            autonomy: str(f["autonomy"]),
          };
        });
      return {
        forecasts: records.flatMap((r) => flatten(r, "forecasts")).slice(0, 20),
        evidenceGaps: records.flatMap((r) => flatten(r, "evidenceGaps")).slice(0, 20),
        interpretation:
          "Forecasts are comparative statements about how similar past states of this account resolved. They are not probabilities, not certainties and not causal. " +
          "Always state the outcome window and the number of comparable states. evidenceGaps mean insufficient forecast evidence — never translate that into 'low risk'. " +
          "Autonomy is capped at prepare: you may explain and recommend, never act.",
      };
    }

    case "script_structure": {
      const q = str(args["title"]).trim().toLowerCase();
      if (!q) return { error: "title is required" };
      const { data, error } = await supabase
        .from("is_script_entries")
        .select("id, title, kind, script_body, updated_at")
        .eq("user_id", userId)
        .ilike("title", `%${q.replace(/[%_]/g, "")}%`)
        .order("updated_at", { ascending: false })
        .limit(5);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as Row[];
      if (rows.length === 0) return { matches: [], note: "No saved script matched that title." };
      const target = rows[0]!;
      const { ingestScript } = await import("@/lib/script/script-ingest");
      const analysis = ingestScript(str(target["script_body"]));
      return {
        // Other near-matches so the model can ask which script was meant.
        otherMatches: rows.slice(1).map((r) => str(r["title"])),
        script: { title: str(target["title"]), kind: str(target["kind"]) },
        complexity: analysis.complexity,
        // Structural facts only: ids and kinds, no prompt or condition text.
        components: analysis.structure.components
          .slice(0, 60)
          .map((c) => ({ id: c.id, kind: c.kind })),
        dependencies: analysis.structure.dependencies
          .slice(0, 80)
          .map((d) => ({ from: d.fromId, to: d.toId, kind: d.kind, resolution: d.resolution })),
        unknowns: analysis.structure.unknowns.slice(0, 20).map((u) => u.reason),
        interpretation:
          analysis.complexity.coverage < 0.6
            ? "Partial reading — a large share of the script was not classified. Treat all statements as provisional."
            : "Structural reading only. Describe shape and reachability; do not claim runtime behaviour.",
      };
    }

    case "search_tickets": {
      const blob = await readBlob(supabase, userId, "tickets");
      const status = str(args["status"]);
      const account = str(args["accountNumber"]);
      const q = str(args["query"]).toLowerCase();
      const rows = arr(blob, "tickets")
        .filter((t) => {
          if (status && status !== "all" && str(t["status"]) !== status) return false;
          if (account && str(t["accountNumber"]) !== account) return false;
          if (q) {
            const details = (t["details"] as Row | undefined) ?? {};
            const hay =
              `${str(t["number"])} ${str(t["accountNumber"])} ${str(t["accountName"])} ${str(details["subject"])}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        })
        .sort((a, b) => num(b["updatedAt"]) - num(a["updatedAt"]))
        .slice(0, 60)
        .map(ticketSummary);
      return { count: rows.length, tickets: rows };
    }

    case "get_ticket": {
      const blob = await readBlob(supabase, userId, "tickets");
      const wanted = str(args["number"]).replace(/^#/, "");
      const t = arr(blob, "tickets").find((x) => str(x["number"]) === wanted);
      if (!t) return { found: false, number: wanted };
      const details = (t["details"] as Row | undefined) ?? {};
      const sessions = (blob["workSessions"] as Record<string, Row> | undefined) ?? {};
      const session = sessions[str(t["id"])] ?? {};
      const notes = (Array.isArray(t["freshdeskNotes"]) ? (t["freshdeskNotes"] as Row[]) : [])
        .slice(0, 15)
        .map((n) => ({ author: str(n["author"]), body: str(n["body"]).slice(0, 1200) }));
      return {
        found: true,
        ...ticketSummary(t),
        requester: details["requesterName"] ?? null,
        issueText: str(session["issueText"]).slice(0, 3000),
        changesText: str(session["changesText"]).slice(0, 3000),
        resultStatus: session["resultStatus"] ?? null,
        resultNotes: str(session["resultNotes"]).slice(0, 2000),
        notes,
      };
    }

    case "list_accounts": {
      const blob = await readBlob(supabase, userId, "accounts");
      const q = str(args["query"]).toLowerCase();
      const rows = arr(blob, "accounts")
        .filter((a) =>
          q ? `${str(a["number"])} ${str(a["name"])}`.toLowerCase().includes(q) : true,
        )
        .slice(0, 80)
        .map((a) => ({ number: str(a["number"]), name: str(a["name"]) }));
      return { count: rows.length, accounts: rows };
    }

    case "account_history": {
      const acct = str(args["accountNumber"]);
      const [tickets, logs] = await Promise.all([
        readBlob(supabase, userId, "tickets"),
        readBlob(supabase, userId, "workspace-worklog"),
      ]);
      const matching = arr(tickets, "tickets")
        .filter((t) => str(t["accountNumber"]) === acct)
        .sort((a, b) => num(b["updatedAt"]) - num(a["updatedAt"]))
        .slice(0, 60)
        .map(ticketSummary);
      const time = arr(logs, "entries")
        .filter((e) => str(e["accountNumber"]) === acct)
        .slice(0, 40)
        .map((e) => ({
          label: str(e["label"]),
          minutes: Math.round(num(e["durationMs"]) / 60000),
          at: num(e["endedAt"]) || num(e["startedAt"]),
        }));
      return { accountNumber: acct, ticketCount: matching.length, tickets: matching, time };
    }

    case "get_night_plan": {
      const blob = await readBlob(supabase, userId, "night-plan");
      return {
        shiftKey: blob["shiftKey"] ?? null,
        items: arr(blob, "items")
          .slice(0, 60)
          .map((i) => ({
            task: str(i["task"]),
            priority: str(i["priority"]),
            status: str(i["status"]),
            notes: str(i["notes"]).slice(0, 500),
          })),
      };
    }

    case "get_dispatches": {
      const blob = await readBlob(supabase, userId, "dispatch");
      const status = str(args["status"]);
      const rows = arr(blob, "sessions")
        .filter((s) => (status ? str(s["status"]) === status : true))
        .sort((a, b) => num(b["updatedAt"]) - num(a["updatedAt"]))
        .slice(0, 40)
        .map((s) => ({
          id: str(s["id"]).slice(0, 12),
          account: `${str(s["accountNumber"])} ${str(s["accountName"])}`.trim(),
          status: str(s["status"]),
          updatedAt: num(s["updatedAt"]),
        }));
      return { count: rows.length, dispatches: rows };
    }

    case "get_work_time": {
      const hours = typeof args["sinceHours"] === "number" ? (args["sinceHours"] as number) : 24;
      const cutoff = Date.now() - hours * 3600_000;
      const blob = await readBlob(supabase, userId, "workspace-worklog");
      const entries = arr(blob, "entries")
        .filter((e) => (num(e["endedAt"]) || num(e["startedAt"])) >= cutoff)
        .slice(0, 80)
        .map((e) => ({
          label: str(e["label"]),
          account: str(e["accountNumber"]),
          minutes: Math.round(num(e["durationMs"]) / 60000),
          at: num(e["endedAt"]) || num(e["startedAt"]),
        }));
      const totalMinutes = entries.reduce((sum, e) => sum + e.minutes, 0);
      return { sinceHours: hours, totalMinutes, count: entries.length, entries };
    }

    case "propose_action": {
      // Proposals are never executed server-side. The client renders an
      // Apply / Discard card and applies the change locally on confirmation.
      return {
        proposed: true,
        note: "Proposal queued for the operator to confirm. Tell them what you proposed in one short line.",
        action: {
          kind: str(args["kind"]),
          task: str(args["task"]) || null,
          notes: str(args["notes"]) || null,
          priority: str(args["priority"]) || null,
          ticketNumber: str(args["ticketNumber"]) || null,
          classification: str(args["classification"]) || null,
          reason: str(args["reason"]) || null,
        },
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}