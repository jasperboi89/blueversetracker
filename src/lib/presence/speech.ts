/**
 * Voice for Clara. Two tiers: the platform speech synthesizer (free, instant)
 * and higher-quality AI voices generated through the app's AI service.
 * Nothing plays until the operator has interacted with the page at least once.
 */
import { presencePrefsStore } from "./presence-prefs-store";
import { claraSpeech } from "./tts.functions";
import { generateKokoroSpeech } from "./kokoro";

let interacted = false;
let audioEl: HTMLAudioElement | null = null;
let audioUrl: string | null = null;

if (typeof window !== "undefined") {
  const mark = () => {
    interacted = true;
    window.removeEventListener("pointerdown", mark);
    window.removeEventListener("keydown", mark);
  };
  window.addEventListener("pointerdown", mark);
  window.addEventListener("keydown", mark);
}

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Every English device voice, best-first. */
export function listDeviceVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported()) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith("en"))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Fires when the browser finishes loading its voice list. */
export function onVoicesChanged(cb: () => void): () => void {
  if (!speechSupported()) return () => {};
  window.speechSynthesis.addEventListener("voiceschanged", cb);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", cb);
}

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const chosen = presencePrefsStore.get().deviceVoiceUri;
  if (chosen) {
    const match = voices.find((v) => v.voiceURI === chosen);
    if (match) return match;
  }
  const preferred = voices.find((v) =>
    /samantha|zira|aria|google us english|female/i.test(v.name),
  );
  return preferred ?? voices.find((v) => v.lang.startsWith("en")) ?? voices[0];
}

function speakWithDevice(text: string) {
  if (!speechSupported()) return;
  const prefs = presencePrefsStore.get();
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = prefs.rate;
    u.pitch = prefs.pitch;
    u.volume = 0.9;
    window.speechSynthesis.speak(u);
  } catch {
    /* speech is best-effort */
  }
}

async function playBlob(blob: Blob): Promise<boolean> {
  try {
    stopSpeaking();
    audioUrl = URL.createObjectURL(blob);
    audioEl = new Audio(audioUrl);
    audioEl.volume = 0.95;
    await audioEl.play();
    return true;
  } catch {
    return false;
  }
}

/** Free, natural voices generated locally in the browser. */
async function speakWithKokoro(text: string): Promise<boolean> {
  const prefs = presencePrefsStore.get();
  try {
    const blob = await generateKokoroSpeech(text.slice(0, 600), prefs.kokoroVoice, prefs.rate);
    return await playBlob(blob);
  } catch {
    return false;
  }
}

async function speakWithAi(text: string): Promise<boolean> {
  const prefs = presencePrefsStore.get();
  try {
    const res = await claraSpeech({
      data: { text: text.slice(0, 600), voice: prefs.aiVoice, speed: Math.min(1.5, Math.max(0.5, prefs.rate)) },
    });
    if (!res.ok || !res.audio) return false;
    const bytes = Uint8Array.from(atob(res.audio), (c) => c.charCodeAt(0));
    stopSpeaking();
    audioUrl = URL.createObjectURL(new Blob([bytes], { type: res.mime ?? "audio/mpeg" }));
    audioEl = new Audio(audioUrl);
    audioEl.volume = 0.95;
    await audioEl.play();
    return true;
  } catch {
    return false;
  }
}

/** Speak a line using the operator's chosen voice tier. */
export function speak(text: string) {
  if (!interacted || !text.trim()) return;
  const prefs = presencePrefsStore.get();
  if (prefs.voiceMode === "kokoro") {
    void speakWithKokoro(text).then((ok) => {
      if (!ok) speakWithDevice(text);
    });
    return;
  }
  if (prefs.voiceMode === "ai") {
    void speakWithAi(text).then((ok) => {
      if (!ok) speakWithDevice(text);
    });
    return;
  }
  speakWithDevice(text);
}

/** Preview a voice without waiting for an interaction gate. */
export function previewVoice(text = "Hi, I'm Clara. I'll keep an eye on tonight's work for you.") {
  interacted = true;
  speak(text);
}

export function stopSpeaking() {
  if (audioEl) {
    try { audioEl.pause(); } catch { /* noop */ }
    audioEl = null;
  }
  if (audioUrl) {
    URL.revokeObjectURL(audioUrl);
    audioUrl = null;
  }
  if (!speechSupported()) return;
  try { window.speechSynthesis.cancel(); } catch { /* noop */ }
}