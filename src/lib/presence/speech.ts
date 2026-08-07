/**
 * Lightweight browser text-to-speech for the Presence avatar.
 * Uses the platform speech synthesizer — no network, no cost, and it never
 * plays until the operator has interacted with the page at least once.
 */
let interacted = false;

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

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const preferred = voices.find((v) =>
    /samantha|zira|aria|google us english|female/i.test(v.name),
  );
  return preferred ?? voices.find((v) => v.lang.startsWith("en")) ?? voices[0];
}

export function speak(text: string) {
  if (!speechSupported() || !interacted || !text.trim()) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = 1.02;
    u.pitch = 1.05;
    u.volume = 0.9;
    window.speechSynthesis.speak(u);
  } catch {
    /* speech is best-effort */
  }
}

export function stopSpeaking() {
  if (!speechSupported()) return;
  try { window.speechSynthesis.cancel(); } catch { /* noop */ }
}