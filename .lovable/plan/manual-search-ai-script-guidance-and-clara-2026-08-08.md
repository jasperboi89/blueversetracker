# Manual search → AI script guidance, and Clara

## 1. Ask AI about a manual search result

In the Knowledge Vault → IS Script Work → Manuals pane, every search hit gets a new **Explain for my script** action next to "Open" and "Save as entry".

Clicking it opens a side panel that shows:

- **What this says** — a plain-language summary of the manual passage.
- **How to use it in a script** — numbered, step by step.
- **Script snippet** — a monospace block with the concrete lines/parameters, with a Copy button.
- **Watch out for** — gotchas the passage implies.
- **Sources** — manual name and page numbers the answer used.

Two ways to run it:
- Per-hit: explains that page.
- **Explain all results** at the top of the results list: sends the top hits together so the answer combines pages across manuals.

If you have an entry open in the Entries pane, the answer is written against that script, and can be pushed into it (appends to "What it's used for and where", snippet into the script body) or saved as a new entry.

## 2. Clara

The avatar becomes **Clara** everywhere in the UI (bubble label, settings section, tooltips).

**Getting out of the way**
- A close (X) button on the avatar dismisses her for the session — she disappears entirely and leaves a small collapsed pill (glowing dot) in the corner to bring her back.
- While hidden, alerts make the pill pulse instead of floating her in; clicking it restores her with the message.
- Settings gains **Hide Clara but keep alerts**, alongside the existing size/opacity controls.
- She becomes draggable — drop her in any corner and the position sticks.

**Voices**
- Settings → Clara gets a **Voice** picker with a **Preview** button that speaks a sample line.
- Two tiers: device voices (free, instant) and higher-quality AI voices generated through the app's AI service (several distinct human voices) — noticeably more natural, using a small amount of AI credit per spoken line.
- Rate and pitch sliders, plus the existing mute toggle on the bubble.

## Technical notes

- `manuals.functions.ts` gains `explainManualPassage` (server fn, gateway AI, strict JSON output: `summary`, `steps[]`, `snippet`, `cautions[]`, `sources[]`), taking the query, selected page texts, and optional current-entry context; streamed and consumed server-side.
- New `ManualExplainPanel.tsx` under `src/components/knowledge/is-scripts/`; `IsManualsPane` gets per-hit and bulk triggers and receives the active entry from `IsScriptWorkspace`.
- Presence: rename to Clara in `PresenceAvatar.tsx`, `PresenceDriver.tsx`, and the settings section. Add `hidden`, `dockCorner`/`offset` to `presence-prefs-store.ts`; collapsed pill and drag handling in `PresenceAvatar.tsx`.
- `speech.ts` extended with `listVoices()`, persisted `voiceURI`/`rate`/`pitch`, and an AI-voice path calling a new text-to-speech server function through the AI gateway, playing the returned audio blob and falling back to device speech on error.