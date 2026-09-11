# Account Command Center

An operations-focused command center for searching, reviewing, and understanding account support history with AI-assisted retrieval and Freshdesk intelligence.

The project is designed to turn scattered ticket history into something supervisors and operations staff can actually interrogate: account context, requester/company details, ticket content, replies, notes, and evidence-backed search results in one place.

## Core capability: Freshdesk Intelligence

Freshdesk Intelligence uses a persistent, read-only search index so searches can inspect ticket:

- subjects and descriptions
- custom fields
- requester and company names
- tags
- replies
- public and private notes

The system distinguishes exact account metadata from account numbers that merely appear inside ticket text, reducing false matches during account lookup.

Natural-language and name-based searches combine full-text retrieval with AI ranking and evidence snippets so users can see why a result was returned.

## How indexing works

After deploying the included Supabase migration:

1. Open **Freshdesk Intelligence** as an administrator.
2. Select **Show Search Debug**.
3. Under **Intelligence index**, choose **Build / refresh index**.
4. Wait for **Full sync complete: yes** before treating an empty result as authoritative.

The first build retrieves the available ticket history in small, resumable batches.

If Freshdesk temporarily rate-limits or rejects a conversation request, the cursor remains on that batch. Run the refresh again after the API recovers.

Later refreshes are incremental and revisit tickets updated since the previous run.

## Search behavior

- Search defaults to the **last 6 months**.
- Closed tickets are included.
- Exact account metadata is treated differently from numbers found only in descriptions or conversations.
- Name and natural-language queries use full-text retrieval plus AI-assisted ranking.
- Evidence snippets help users validate why a result matched.

## Tech stack

- React 19 + TypeScript
- TanStack Start / TanStack Router
- TanStack Query
- Supabase
- Tailwind CSS v4
- Radix UI / shadcn-style component primitives
- Vitest
- Zod
- Tiptap
- Three.js / React Three Fiber
- PDF.js

## Development

### Run locally

```sh
bun install
bun dev
```

### Quality checks

```sh
bun run test
bun run build
bun run lint
bun run format
```

## Operational philosophy

Account Command Center favors traceable, evidence-backed results over opaque answers. Search output is intended to help a human operator find the right account history quickly while preserving enough context to verify the result.

The Freshdesk index is read-only by design: intelligence and retrieval should not silently mutate the underlying support history.

## Project status

This repository is actively developed. The current README documents the Freshdesk Intelligence portion of the system and its indexing/search workflow.

## Why the repository name may look different

This repository currently lives under the historical name `blueversetracker`, while the product itself is **Account Command Center**. The product name in this README is the canonical name for the application experience.
