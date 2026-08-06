# Pull work items from your Outlook inbox

Connect your Microsoft 365 mailbox to the Hub, have the AI read recent mail, and surface anything that looks like real work right alongside your Freshdesk tickets on **Assigned to Me**.

## How it works

1. **Connect Outlook once.** You authorize your own Microsoft 365 account through Lovable's connector. Nothing is stored in the app but the connection — no password, no mail copies beyond what's needed to show the item.
2. **Background sweep.** On the same rhythm as the Freshdesk poller (every 3 minutes, only while the tab is visible), the Hub pulls recent messages from your Inbox — last 24 hours by default, newest first, subject/sender/preview only.
3. **AI triage.** Each new message runs through a cheap-tier AI pass that answers: is this actionable work, or noise? It returns a verdict, a one-line "what's being asked", an urgency read, and any account number or ticket number it can spot in the text. Newsletters, notifications, out-of-office, calendar spam, and FYI threads get filtered out.
4. **Merged into Assigned to Me.** Actionable mail appears as cards in the same list as your Freshdesk tickets, tagged with an envelope icon so the source is obvious. Same behaviors you already have: dismiss, mark seen, new-item toast, unread badge.
5. **Act on it.** Each email card gets: open in Outlook, dismiss, and **Promote to work** — which drops it into your night plan (or creates an Additional Work item) pre-filled with the subject and the AI's summary, linked to the account if one was detected.

## Controls

A new **Email** block in Settings with:
- Connection status and a disconnect option
- Lookback window (12h / 24h / 3 days)
- Sender or subject keywords to always ignore
- A toggle to pause email triage entirely (separate from the global AI kill-switch, which still overrides everything)

## What it will not do

Read-only. It never sends, replies, deletes, or marks anything read in your mailbox. Message bodies are only held in memory long enough to triage; nothing but the triage result (subject, sender, summary, ids) is stored locally.

## Technical notes

- Link the `microsoft_outlook` App connector; calls go through the Lovable connector gateway (`/me/messages` with `$top`, `$select`, `$filter` on `receivedDateTime`), never the Graph API directly.
- New `src/lib/api/outlook.functions.ts` server functions: `outlookTestConnection`, `outlookListRecent`. Gateway credentials read from `process.env` inside handlers only.
- Triage lives in `src/lib/ai/ai.functions.ts` as `aiTriageEmails` — batched, strict JSON schema out, `fast` model tier, respects the existing AI-disabled guard.
- New `src/lib/email-inbox-store.ts` mirroring `assigned-inbox-store.ts` (localStorage persistence, seen/dismissed sets, visibility-aware poller). A poller component sits next to `AssignedInboxPoller` in the authenticated shell.
- `AssignedInboxPage` renders a unified list from both stores, sorted by recency, with a source filter (All / Freshdesk / Email).
- Triage results are cached by message id so re-polling doesn't re-bill AI calls.

## First step

Linking the Outlook connection needs a one-click approval from you; I'll surface that as soon as you approve this plan.
