# Plan: Enhanced HoloQuiet Hover Lift & 3D Glow

## Objective
Make HoloQuiet theme panes (`.glass-panel`, `.hq-working`, `.hq-instrument`) lift more prominently on hover and surround them with a visible 3D luminous glow so the depth effect is unmistakable.

## Current State
- Lift: `translateY(-6px)` and `scale(1.008)`
- Shadow: two dark drop-shadows plus a subtle cyan photon-blue glow
- No dedicated halo / rim-glow layer beneath the pane

## Changes

### 1. Increase the physical lift
- Raise `--hq-lift-float` from `-6px` to `-14px`
- Increase `--hq-scale-float` from `1.008` to `1.012`
- Add a slight `rotateX(1.5deg)` on hover to enhance the 3D perspective (only on wider viewports to avoid mobile jitter)

### 2. Add a luminous glow layer (pseudo-element)
- Introduce a new `.glass-panel::before` / `.hq-working::before` rule that is normally hidden (`opacity: 0`, `scale: 0.95`)
- On hover, this pseudo-element fades in behind the pane with a large, soft radial gradient using the spectral cyan/blue family
- This creates the “floating above a light pad” look typical of holographic interfaces

### 3. Intensify the ambient box-shadow on hover
- Replace the existing hover `box-shadow` with three layers:
  - Tight contact shadow directly beneath the pane (sharp, dark)
  - Mid-diffusion shadow for the body of the lift
  - Wide, soft spectral glow halo (cyan → violet) that bleeds outward
- Colors are drawn from the existing HoloQuiet signal tokens (`--hq-ion-cyan`, `--hq-photon-blue`, `--hq-spectral-violet`) so the palette stays coherent

### 4. Edge refraction highlight
- On hover, brighten the top `inset` border/line to simulate light catching the upper edge of the lifted glass

### 5. Safe exclusions & motion
- Keep the existing `:not([data-slot=...])` exclusions so dialogs/sheets/popovers never inherit the hover transform
- Keep `@media (prefers-reduced-motion: reduce)` and `html[data-motion="reduced"]` blocks intact, simply disabling the transform and fading the glow instead of snapping it

## Verification
- Preview will show panels that lift ~14px and emit a soft cyan/blue halo on hover
- Modals, drawers, and popovers remain locked in place (no lift)
- Reduced-motion mode keeps the pane flat but can still show a static glow border (optional)
