# Remove Clara from the portal

Clara (the floating holographic companion) gets fully removed, along with her voice system and settings panel. The Copilot stays — the standard chat launcher takes back over, and insight toasts return to handling every alert.

## What changes for you

- No floating avatar, speech bubble, or collapsed pill anywhere in the app.
- The Copilot launcher button is always present again (it was hidden while Clara was on).
- High-severity insights always show as toasts, instead of being routed to Clara.
- Settings loses the "Presence Avatar / Clara" section, including all voice, size, and check-in controls.

## Technical details

Delete:
- `src/components/presence/PresenceAvatar.tsx`, `PresenceDriver.tsx`
- `src/lib/presence/` (presence-store, presence-prefs-store, speech, kokoro, tts.functions)
- `src/assets/clara-avatar.png.asset.json` and the unused `avatar-hologram.mp4.asset.json`

Edit:
- `src/routes/_authenticated/route.tsx` — drop presence imports/prefs; always render `<CopilotLauncher />`.
- `src/components/workspace/InsightToaster.tsx` — remove the presence check so high-severity insights always toast.
- `src/routes/_authenticated/settings.tsx` — remove `PresenceSection`, its nav entry, and all presence/voice imports.
- `src/styles.css` — remove the `presence-float` keyframes and Clara-only glow rules.

Leave alone: the Copilot sheet, awareness/insights logic, and the celebration system. Stored `aih:settings:presence:v1` localStorage keys become inert; no migration needed.