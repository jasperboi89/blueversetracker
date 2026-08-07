import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Volume2, VolumeX, X, ArrowUpRight, MessageSquare } from "lucide-react";
import avatarAsset from "@/assets/avatar-hologram.mp4.asset.json";
import { usePresenceMessage, presenceDismiss, presenceSpeak } from "@/lib/presence/presence-store";
import { presencePrefsStore, usePresencePrefs } from "@/lib/presence/presence-prefs-store";
import { speak, stopSpeaking } from "@/lib/presence/speech";
import { useEffectiveMotion } from "@/lib/settings/display-prefs-store";
import { openCopilot } from "@/components/workspace/CopilotSheet";
import { useInsights, hasHighInsight } from "@/lib/ai/awareness";

const TONE_COLOR: Record<string, string> = {
  alert: "oklch(0.82 0.18 25)",
  checkin: "var(--cyan-glow)",
  greeting: "var(--violet-glow)",
  wrap: "var(--gold-glow)",
  neutral: "var(--cyan-glow)",
};

/**
 * Holographic companion. Idles quietly in the lower-right corner, brightens
 * and opens a speech bubble when it has something to say, and opens the
 * Copilot when tapped.
 */
export function PresenceAvatar() {
  const prefs = usePresencePrefs();
  const msg = usePresenceMessage();
  const motion = useEffectiveMotion();
  const navigate = useNavigate();
  const insights = useInsights();
  const alert = hasHighInsight(insights);
  const [videoOk, setVideoOk] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Speak new messages aloud when voice is on.
  useEffect(() => {
    if (!msg || !prefs.voice) return;
    speak(msg.text);
    return () => stopSpeaking();
  }, [msg, prefs.voice]);

  useEffect(() => {
    if (!msg) stopSpeaking();
  }, [msg]);

  if (!prefs.enabled) return null;

  const accent = TONE_COLOR[msg?.tone ?? "neutral"] ?? "var(--cyan-glow)";
  const size = Math.max(80, Math.min(220, prefs.size));
  const active = Boolean(msg);

  function summon() {
    if (msg) {
      openCopilot();
      presenceDismiss();
      return;
    }
    presenceSpeak({
      id: "summon",
      tone: "neutral",
      text: alert
        ? "Something needs a look — open the Copilot and I'll walk you through it."
        : "I'm here. Ask me anything about tonight's work.",
      ask: "What should I focus on right now?",
      force: true,
      ttlMs: 14_000,
    });
  }

  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-[115] flex items-end gap-2">
      {msg && (
        <div
          className="glass-panel pointer-events-auto mb-6 max-w-xs p-3 text-xs"
          style={{
            animation: motion === "reduced" ? undefined : "fade-in 0.28s ease-out",
            boxShadow: `0 0 24px color-mix(in oklab, ${accent} 35%, transparent)`,
            borderColor: `color-mix(in oklab, ${accent} 40%, transparent)`,
          }}
          role="status"
        >
          <div className="flex items-start gap-2">
            <p className="flex-1 leading-relaxed text-foreground">{msg.text}</p>
            <button
              onClick={presenceDismiss}
              aria-label="Dismiss"
              className="text-muted-foreground transition hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {msg.to && (
              <button
                onClick={() => {
                  const to = msg.to!.replace(/^\/_authenticated/, "");
                  navigate({ to: to as never, params: (msg.params ?? {}) as never });
                  presenceDismiss();
                }}
                className="inline-flex items-center gap-1 rounded-md border border-border/50 px-2 py-1 text-[11px] text-foreground transition hover:bg-white/5"
              >
                <ArrowUpRight className="h-3 w-3" /> Open
              </button>
            )}
            <button
              onClick={() => {
                openCopilot();
                presenceDismiss();
              }}
              className="inline-flex items-center gap-1 rounded-md border border-border/50 px-2 py-1 text-[11px] text-foreground transition hover:bg-white/5"
            >
              <MessageSquare className="h-3 w-3" /> Ask
            </button>
            <button
              onClick={() =>
                presencePrefsStore.update((c) => ({ ...c, voice: !c.voice }))
              }
              title={prefs.voice ? "Mute voice" : "Speak messages aloud"}
              className="ml-auto inline-flex items-center rounded-md border border-border/50 p-1 text-muted-foreground transition hover:text-foreground"
            >
              {prefs.voice ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
            </button>
          </div>
        </div>
      )}

      <button
        onClick={summon}
        title="Intel Copilot presence"
        aria-label="Intel Copilot presence"
        className="pointer-events-auto relative grid place-items-center rounded-full"
        style={{ width: size, height: size }}
      >
        {/* Floor glow */}
        <span
          aria-hidden
          className="absolute bottom-1 h-3 rounded-[50%]"
          style={{
            width: size * 0.6,
            background: `radial-gradient(ellipse at center, ${accent} 0%, transparent 70%)`,
            opacity: active ? 0.75 : 0.35,
            filter: "blur(3px)",
          }}
        />
        {videoOk ? (
          <video
            ref={videoRef}
            src={avatarAsset.url}
            autoPlay
            muted
            loop
            playsInline
            onError={() => setVideoOk(false)}
            className="h-full w-full rounded-full object-cover"
            style={{
              mixBlendMode: "screen",
              opacity: active ? 1 : Math.max(0.2, Math.min(1, prefs.opacity)),
              filter: `drop-shadow(0 0 18px color-mix(in oklab, ${accent} 55%, transparent)) saturate(1.15)`,
              transition: "opacity 400ms ease",
              animation:
                motion === "reduced" ? undefined : "presence-float 6s ease-in-out infinite",
            }}
          />
        ) : (
          <span
            aria-hidden
            className="h-2/3 w-2/3 rounded-full"
            style={{
              background: `radial-gradient(circle at 40% 35%, ${accent} 0%, transparent 70%)`,
              boxShadow: `0 0 34px ${accent}`,
              opacity: active ? 0.95 : prefs.opacity,
              animation:
                motion === "reduced" ? undefined : "presence-float 6s ease-in-out infinite",
            }}
          />
        )}
        {/* Scanlines */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background:
              "repeating-linear-gradient(180deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 4px)",
            opacity: 0.5,
            mixBlendMode: "overlay",
          }}
        />
        {alert && !active && (
          <span
            className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold"
            style={{
              background: "oklch(0.82 0.18 25)",
              color: "white",
              boxShadow: "0 0 10px oklch(0.82 0.18 25)",
              animation: "pulse-glow 2.4s ease-in-out infinite",
            }}
          >
            !
          </span>
        )}
      </button>
    </div>
  );
}