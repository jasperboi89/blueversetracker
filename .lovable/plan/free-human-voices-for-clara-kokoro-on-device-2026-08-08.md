# Free human voices for Clara (Kokoro, on-device)

Today Clara has two voice tiers: your device's built-in voices (free, robotic) and AI gateway voices (natural, but each spoken line costs a small amount of AI credit).

This adds a third tier that is both natural-sounding and free: **Kokoro**, a small open-weights voice model that runs inside your browser. No API key, no per-line cost, works offline once loaded.

## What you get

- Settings → Clara → Voice gains a **Kokoro (free, on-device)** option alongside Device and AI voices.
- A voice picker with Kokoro's human voices (several US/UK female and male options, e.g. Heart, Bella, Nova, Michael, Fable), plus the existing rate slider and Preview button.
- First use downloads the voice model once (roughly 80–90 MB) with a visible "Preparing Clara's voice…" progress state; after that it's cached by the browser and speaks instantly with no network call.
- If the model fails to load or the device is too constrained, Clara falls back to the device voice automatically — she never goes silent.

## Trade-offs to know

- One-time model download per browser; on a slow connection the first line is delayed.
- Generation is local, so a long sentence takes a moment on older machines (short alert lines are near-instant).
- Fish Audio S1/S2 is not free for hosted API use and has no in-browser runtime, so it isn't a fit here; Kokoro is the closest free equivalent in quality.

## Technical notes

- Add `kokoro-js` (Transformers.js/ONNX Runtime Web, WASM + WebGPU when available). Load it lazily via dynamic import from `speech.ts` so nothing ships to the initial bundle and SSR never touches it.
- `presence-prefs-store.ts`: extend `VoiceMode` with `"kokoro"` and add `kokoroVoice: string`.
- New `src/lib/presence/kokoro.ts`: singleton model loader (dtype `q8`, device `webgpu` with `wasm` fallback), `listKokoroVoices()`, `generate(text, voice, speed)` returning audio the existing player can play; guard against concurrent loads and cancel in-flight speech on `stopSpeaking()`.
- `speak()` in `speech.ts` gets a `kokoro` branch before the existing AI/device branches, reusing the current `audioEl`/blob-URL playback and falling back to `speakWithDevice` on any failure.
- Settings section: add the tier radio, Kokoro voice select, load-progress indicator, and wire Preview to the same path.
