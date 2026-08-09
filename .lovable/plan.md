# Additional Work subject: label + account, with AI summarize

Make the Work Title (subject) read as one clean line that always carries the account, e.g.

```text
1042 · Acme Dental — Client change — holiday hours update
```

## Changes

- **Auto account prefix**: when an account number/name is set on the Create modal, the subject automatically gets `<number> · <name> — ` in front. Changing the account swaps the prefix instead of stacking a second one; clearing the account removes it.
- **Starter chips** (Client change, Scripting fix, ...) insert the label after the account prefix, never before it, so the account stays first.
- **Summarize subject**: the existing "Suggest subject" chip becomes "Summarize subject" — it reads what's typed in "What Needs Done" (plus Notes if present), asks AI for a short subject line, and rebuilds the field as `account prefix + label (if one was chosen) + AI summary`. The account number and name are always preserved.
- **Task detail page**: the subject is editable there too, with the same account prefix behavior and Summarize button, so an existing task can be re-summarized after more info comes in.
- Recent-subject chips store and re-apply the label + summary part only; the prefix is re-added from the task's current account.

## Technical notes

- New helper module `src/lib/additional-work/subject.ts` with `buildSubject({ accountNumber, accountName, label, body })`, `parseSubject(value)` (splits prefix / label / body), and `withAccountPrefix(subject, account)` so prefix logic lives in one place and both screens share it.
- `SubjectBuilder.tsx`: takes the account, applies prefix on every change, renames the AI action to "Summarize subject", and passes the combined describe text; AI result replaces only the body segment.
- `CreateAdditionalWorkModal.tsx`: re-apply the prefix when account number/name changes; `rememberSubject` stores the body segment.
- `additional-work.$workId.work.tsx`: add an inline editable subject row in the header using the same `SubjectBuilder`, saving via `additionalWorkStore.update`.
- Reuses the existing `aiSuggestSubject` server function; no schema or backend changes.
