# Holographic Copilot Avatar ("Presence")

A floating holographic companion that drifts in when something needs attention, checks in during a shift, greets you at shift start/end, and can be summoned any time. It speaks in a glass speech bubble and, optionally, out loud.

## What you'll see

- A small holographic figure in the lower-right corner, rendered as a looping video with a soft glow, scanlines and a light floor reflection. It idles semi-transparent, brightens when it has something to say.
- A speech bubble next to it with the message plus actions: **Open** (jumps to the ticket/page), **Ask** (opens the Copilot chat with that context), **Dismiss**.
- Optional voice: the message is spoken aloud via text-to-speech. Off by default, toggled in Settings; a small mute button sits on the bubble.
- It replaces the sparkle launcher button as the way to summon the Copilot — clicking the avatar opens the Copilot sheet.

## When it floats in

1. **High-severity insights** — overdue tickets, long time-on-task, blocked work. These currently fire red toasts; the avatar takes over for high severity, toasts stay for warnings.
2. **Periodic check-ins** — during an active shift, at a relaxed interval (default ~45 min, tunable), with a contextual line: "Still on ticket 12345? 38 minutes in."
3. **Shift start / shift end** — a greeting with the night's plan summary, and a wrap-up at the end.
4. **On demand** — click the avatar any time.

Quiet mode and Sleep mode suppress everything except summon. Nothing appears while the tab is hidden. A per-message cooldown prevents pile-ups.

## Settings

New "Presence" section: avatar on/off, voice on/off, check-in frequency (off / relaxed / normal / attentive), and a size/opacity control.

## Technical notes

- **Asset**: generate a 1080p looping clip of a holographic figure on black (`src/assets/avatar-hologram.mp4`), played muted/looped/inline with `mix-blend-mode: screen` so black drops out and it reads as a true hologram over any background. A CSS-only orb fallback renders when the video can't play or reduced-motion is set.
- **New component** `src/components/presence/PresenceAvatar.tsx` — the video shell, bubble, actions, enter/exit animation. Mounted once in `AppShell` next to `InsightToaster`.
- **New store** `src/lib/presence/presence-store.ts` — the message queue, cooldowns, dismissal memory, and a `speak()` entry point other modules can call.
- **Triggers** — a `PresenceDriver` hook subscribes to `useInsights()` (high severity only), a shift-aware check-in interval using `shift-window.ts`, and shift start/end edges. `InsightToaster` is narrowed to warn-level so messages don't double-fire.
- **Voice** — text-to-speech through the AI gateway inside a server function, played from a blob URL; browser `speechSynthesis` as fallback. Never auto-plays until the user has interacted with the page.
- **Prefs** — extend the existing persisted settings store pattern (`display-prefs-store.ts` style) so choices sync like other settings, with the new panel in `settings.tsx`.
