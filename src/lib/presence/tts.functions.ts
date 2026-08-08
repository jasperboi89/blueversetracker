import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveAuthorizedUser } from "@/integrations/supabase/require-authorized";

/** Human-sounding gateway voices offered for Clara. */
export const CLARA_AI_VOICES = [
  { id: "shimmer", label: "Clara — bright" },
  { id: "coral", label: "Clara — warm" },
  { id: "sage", label: "Clara — calm" },
  { id: "nova", label: "Nova — crisp" },
  { id: "alloy", label: "Alloy — neutral" },
  { id: "ballad", label: "Ballad — soft" },
] as const;
export type ClaraAiVoice = (typeof CLARA_AI_VOICES)[number]["id"];

const SpeechSchema = z.object({
  text: z.string().trim().min(1).max(600),
  voice: z.enum(CLARA_AI_VOICES.map((v) => v.id) as [string, ...string[]]).default("shimmer"),
  speed: z.number().min(0.5).max(1.5).default(1),
});

/**
 * Generate spoken audio for a Clara message through the Lovable AI gateway.
 * Returns base64 MP3 so the browser can play it from a blob URL.
 */
export const claraSpeech = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => SpeechSchema.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { ok: false as const, error: "Voice unavailable: AI key not configured." };
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": key,
          "X-Lovable-AIG-SDK": "fetch",
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini-tts",
          voice: data.voice,
          input: data.text,
          speed: data.speed,
          response_format: "mp3",
        }),
      });
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 200);
        return { ok: false as const, error: `Voice failed (${res.status}). ${detail}` };
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      let binary = "";
      for (let i = 0; i < buf.length; i += 1) binary += String.fromCharCode(buf[i]);
      return { ok: true as const, audio: btoa(binary), mime: "audio/mpeg" };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Voice failed." };
    }
  });