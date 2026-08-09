# Futuristic Login Entrance

Make the sign-in card arrive with a holographic "materialize and float in" sequence instead of appearing instantly.

## What you'll see

- The page background dims in with a soft cyan/violet glow forming behind the card.
- The card rises from slightly below, scaling up from ~96% with a subtle 3D tilt that levels out.
- A quick light sweep passes across the glass surface as it settles.
- The shield icon pops in a beat after the card, followed by the title, badge, and form fields staggering upward.
- Once settled, the card keeps a very slow idle float so it feels suspended.
- Users with reduced-motion preferences get a simple fade, no movement.

## Technical notes

- Add keyframes to `src/styles.css`: `auth-card-in` (translateY + scale + rotateX + opacity), `auth-stagger-in` (small rise + fade), `auth-sweep` (light sweep across the panel), reusing the existing `float-y` for the idle drift.
- In `src/components/auth/LoginCard.tsx`, wrap the panel in a perspective container, apply the entrance animation to the card, add an overlay span for the sweep, and give inner blocks (shield, heading, badge, notice, form, footer) staggered `animation-delay` values.
- Add an ambient radial glow layer behind the card on `src/routes/auth.tsx` that fades in with the card.
- Guard all motion with `@media (prefers-reduced-motion: reduce)` so animations collapse to opacity-only.
- Presentation-only: no auth logic, routing, or backend changes.
