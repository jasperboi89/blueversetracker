import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Volume2, VolumeX, X, ArrowUpRight, MessageSquare, Sparkles } from "lucide-react";
import claraAsset from "@/assets/clara-avatar.png.asset.json";
import { usePresenceMessage, presenceDismiss, presenceSpeak } from "@/lib/presence/presence-store";
import {
  presencePrefsStore,
  usePresencePrefs,
  type PresenceCorner,
} from "@/lib/presence/presence-prefs-store";
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

/** Portrait aspect (height / width) of the cutout. */
const ASPECT = 1.31;

/** Fallback fractional position for legacy corner prefs. */
const CORNER_POS: Record<PresenceCorner, { x: number; y: number }> = {
  br: { x: 0.82, y: 0.58 },
  bl: { x: 0.02, y: 0.58 },
  tr: { x: 0.82, y: 0.1 },
  tl: { x: 0.02, y: 0.1 },
};

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/**
 * Clara — the holographic companion. A transparent cutout portrait that can be
 * dragged anywhere on screen, brightens with a speech bubble when she has
 * something to say, opens the Copilot when tapped, and collapses to a pill.
 */
export function PresenceAvatar() {
  const prefs = usePresencePrefs();
  const msg = usePresenceMessage();
  const motion = useEffectiveMotion();
  const navigate = useNavigate();
  const insights = useInsights();
  const alert = hasHighInsight(insights);
  const [imgOk, setImgOk] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const dragState = useRef<{ moved: boolean } | null>(null);

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
  const width = Math.max(80, Math.min(260, prefs.size));
  const height = width * ASPECT;
  const active = Boolean(msg);
  const hidden = prefs.hidden;

  const frac = prefs.pos ?? CORNER_POS[prefs.corner ?? "br"];
  const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const left = drag ? drag.x : clamp(frac.x * vw, 4, Math.max(4, vw - width - 4));
  const top = drag ? drag.y : clamp(frac.y * vh, 56, Math.max(56, vh - height - 4));
  const bubbleOnLeft = left + width / 2 > vw / 2;

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
        : "I'm Clara. Ask me anything about tonight's work.",
      ask: "What should I focus on right now?",
      force: true,
      ttlMs: 14_000,
    });
  }

  function startDrag(event: React.PointerEvent) {
    dragState.current = { moved: false };
    const offsetX = event.clientX - left;
    const offsetY = event.clientY - top;
    const move = (e: PointerEvent) => {
      if (
        !dragState.current?.moved &&
        Math.abs(e.clientX - (left + offsetX)) + Math.abs(e.clientY - (top + offsetY)) <= 8
      )
        return;
      if (dragState.current) dragState.current.moved = true;
      setDragging(true);
      setDrag({
        x: clamp(e.clientX - offsetX, 4, window.innerWidth - width - 4),
        y: clamp(e.clientY - offsetY, 56, window.innerHeight - height - 4),
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDragging(false);
      setDrag((cur) => {
        if (cur && dragState.current?.moved) {
          presencePrefsStore.update((c) => ({
            ...c,
            pos: { x: cur.x / window.innerWidth, y: cur.y / window.innerHeight },
          }));
        }
        return null;
      });
      setTimeout(() => {
        dragState.current = null;
      }, 0);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // Collapsed: a small pill that pulses when Clara has something waiting.
  if (hidden) {
    return (
      <div
        className="pointer-events-none fixed z-[115]"
        style={{ left: clamp(left, 4, vw - 44), top: clamp(top + height - 40, 56, vh - 44) }}
      >
        <button
          onClick={() => {
            presencePrefsStore.update((c) => ({ ...c, hidden: false }));
            if (!msg) summon();
          }}
          title={msg ? `Clara: ${msg.text}` : "Bring Clara back"}
          aria-label={msg ? `Clara has a message: ${msg.text}` : "Bring Clara back"}
          className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-black/50 backdrop-blur"
          style={{
            boxShadow: `0 0 ${msg || alert ? 22 : 10}px color-mix(in oklab, ${accent} 60%, transparent)`,
            animation:
              (msg || alert) && motion !== "reduced"
                ? "pulse-glow 2s ease-in-out infinite"
                : undefined,
          }}
        >
          <Sparkles className="h-4 w-4" style={{ color: accent }} />
        </button>
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none fixed z-[115]"
      style={{
        left,
        top,
        width,
        height,
        transition: dragging ? "none" : "left 220ms ease, top 220ms ease",
      }}
    >
      {msg && (
        <div
          className="glass-panel pointer-events-auto absolute max-w-xs p-3 text-xs"
          style={{
            top: 0,
            [bubbleOnLeft ? "right" : "left"]: width + 10,
            width: 260,
            animation: motion === "reduced" ? undefined : "fade-in 0.28s ease-out",
            boxShadow: `0 0 24px color-mix(in oklab, ${accent} 35%, transparent)`,
            borderColor: `color-mix(in oklab, ${accent} 40%, transparent)`,
          }}
          role="status"
        >
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Clara
              </p>
              <p className="leading-relaxed text-foreground">{msg.text}</p>
            </div>
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
              onClick={() => presencePrefsStore.update((c) => ({ ...c, voice: !c.voice }))}
              title={prefs.voice ? "Mute voice" : "Speak messages aloud"}
              className="ml-auto inline-flex items-center rounded-md border border-border/50 p-1 text-muted-foreground transition hover:text-foreground"
            >
              {prefs.voice ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => {
          if (dragState.current?.moved) return;
          summon();
        }}
        onPointerDown={startDrag}
        title="Clara — tap to talk, drag to move"
        aria-label="Clara, your holographic assistant"
        className="pointer-events-auto relative grid h-full w-full place-items-end bg-transparent"
        style={{ cursor: dragging ? "grabbing" : "pointer", touchAction: "none" }}
      >
        <span
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            presenceDismiss();
            stopSpeaking();
            presencePrefsStore.update((c) => ({ ...c, hidden: true }));
          }}
          role="button"
          tabIndex={0}
          title="Hide Clara (alerts keep coming)"
          aria-label="Hide Clara"
          className="absolute left-0 top-0 z-10 grid h-6 w-6 cursor-pointer place-items-center rounded-full border border-white/15 bg-black/60 text-muted-foreground opacity-0 transition hover:text-foreground focus:opacity-100 group-hover:opacity-100"
          style={{ opacity: active ? 1 : undefined }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = active ? "1" : "0")}
        >
          <X className="h-3 w-3" />
        </span>

        {/* Floor glow */}
        <span
          aria-hidden
          className="absolute -bottom-1 left-1/2 h-3 -translate-x-1/2 rounded-[50%]"
          style={{
            width: width * 0.55,
            background: `radial-gradient(ellipse at center, ${accent} 0%, transparent 70%)`,
            opacity: active ? 0.7 : 0.3,
            filter: "blur(4px)",
          }}
        />

        {imgOk ? (
          <img
            src={claraAsset.url}
            alt=""
            draggable={false}
            onError={() => setImgOk(false)}
            className="h-full w-full select-none object-contain"
            style={{
              opacity: active ? 1 : Math.max(0.35, Math.min(1, prefs.opacity)),
              filter: `drop-shadow(0 0 10px color-mix(in oklab, ${accent} 55%, transparent)) drop-shadow(0 0 26px color-mix(in oklab, ${accent} 30%, transparent)) saturate(1.05)`,
              transition: "opacity 400ms ease",
              animation:
                motion === "reduced" ? undefined : "presence-float 6s ease-in-out infinite",
              maskImage:
                "linear-gradient(to bottom, black 0%, black 86%, transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(to bottom, black 0%, black 86%, transparent 100%)",
            }}
          />
        ) : (
          <span
            aria-hidden
            className="mx-auto mb-4 h-2/3 w-2/3 rounded-full"
            style={{
              background: `radial-gradient(circle at 40% 35%, ${accent} 0%, transparent 70%)`,
              boxShadow: `0 0 34px ${accent}`,
              opacity: active ? 0.95 : prefs.opacity,
              animation:
                motion === "reduced" ? undefined : "presence-float 6s ease-in-out infinite",
            }}
          />
        )}

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
