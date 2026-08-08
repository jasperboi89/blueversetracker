/**
 * Kokoro — free, natural-sounding voices that run entirely in the browser.
 * The model is downloaded once (~90MB) and cached by the browser; after that
 * every line is generated locally with no network call and no AI credits.
 */

export interface KokoroVoiceOption {
  id: string;
  label: string;
}

/** Curated human voices from Kokoro-82M (US/UK, female + male). */
export const KOKORO_VOICES: KokoroVoiceOption[] = [
  { id: "af_heart", label: "Heart — warm (US female)" },
  { id: "af_bella", label: "Bella — bright (US female)" },
  { id: "af_nicole", label: "Nicole — soft (US female)" },
  { id: "af_nova", label: "Nova — crisp (US female)" },
  { id: "af_sky", label: "Sky — light (US female)" },
  { id: "am_michael", label: "Michael — steady (US male)" },
  { id: "am_puck", label: "Puck — lively (US male)" },
  { id: "bf_emma", label: "Emma — calm (UK female)" },
  { id: "bf_isabella", label: "Isabella — poised (UK female)" },
  { id: "bm_fable", label: "Fable — storyteller (UK male)" },
  { id: "bm_george", label: "George — warm (UK male)" },
];

export const DEFAULT_KOKORO_VOICE = "af_heart";

type Tts = {
  generate: (text: string, opts: { voice: string; speed?: number }) => Promise<{ toBlob: () => Blob }>;
};

let ttsPromise: Promise<Tts> | null = null;
let progressCb: ((pct: number | null) => void) | null = null;

/** Subscribe to model-download progress (0–100, or null when idle/done). */
export function onKokoroProgress(cb: (pct: number | null) => void): () => void {
  progressCb = cb;
  return () => {
    if (progressCb === cb) progressCb = null;
  };
}

function report(pct: number | null) {
  try { progressCb?.(pct); } catch { /* noop */ }
}

/** Load (once) and return the Kokoro engine. */
export async function loadKokoro(): Promise<Tts> {
  if (ttsPromise) return ttsPromise;
  ttsPromise = (async () => {
    report(0);
    const { KokoroTTS } = await import("kokoro-js");
    const files: Record<string, number> = {};
    const tts = (await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
      dtype: "q8",
      device: "wasm",
      progress_callback: (e: { status?: string; file?: string; progress?: number }) => {
        if (e?.status === "progress" && e.file) {
          files[e.file] = Math.max(0, Math.min(100, e.progress ?? 0));
          const vals = Object.values(files);
          report(Math.round(vals.reduce((a, b) => a + b, 0) / vals.length));
        }
      },
    } as never)) as unknown as Tts;
    report(null);
    return tts;
  })().catch((err) => {
    ttsPromise = null;
    report(null);
    throw err;
  });
  return ttsPromise;
}

/** Generate speech locally and return a playable WAV blob. */
export async function generateKokoroSpeech(
  text: string,
  voice: string,
  speed: number,
): Promise<Blob> {
  const tts = await loadKokoro();
  const audio = await tts.generate(text, {
    voice: KOKORO_VOICES.some((v) => v.id === voice) ? voice : DEFAULT_KOKORO_VOICE,
    speed: Math.min(1.5, Math.max(0.5, speed)),
  });
  return audio.toBlob();
}
