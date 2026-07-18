import type { LucideIcon } from "lucide-react";
import {
  Sparkles,
  Ticket,
  Flame,
  Award,
  Trophy,
  Crown,
  Zap,
  PhoneOutgoing,
  Compass,
  Search,
  BookOpen,
  Library,
  Scissors,
  Moon,
  MoonStar,
  Star,
  Wand2,
  Feather,
  Bird,
  HeartHandshake,
  Undo2,
} from "lucide-react";

export type AchievementTier = "bronze" | "silver" | "gold" | "mythic";
export type AchievementCategory =
  | "tickets"
  | "dispatch"
  | "knowledge"
  | "consistency"
  | "ai"
  | "hidden";

export interface AchievementDef {
  id: string;
  title: string;
  flavor: string;
  icon: LucideIcon;
  tier: AchievementTier;
  category: AchievementCategory;
  /** Target progress value at which unlock triggers. */
  target: number;
  /** Human label for what's being counted (e.g. "tickets", "notes"). */
  unit: string;
  /** Which discovery kind / stat backs this achievement. */
  source:
    | { type: "discovery-count"; kind: string }
    | { type: "knowledge-count" }
    | { type: "sanctuary-count" }
    | { type: "overdue-clear" }
    | { type: "night-hours" };
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // Ticket flow
  { id: "first_contact", title: "First Contact", flavor: "The first signal in the dark. Every constellation starts here.", icon: Sparkles, tier: "bronze", category: "tickets", target: 1, unit: "ticket", source: { type: "discovery-count", kind: "ticket" } },
  { id: "steady_hand", title: "Steady Hand", flavor: "Ten resolved. The rhythm finds you.", icon: Ticket, tier: "bronze", category: "tickets", target: 10, unit: "tickets", source: { type: "discovery-count", kind: "ticket" } },
  { id: "rhythm", title: "Rhythm", flavor: "Twenty-five closed. You've stopped thinking about it.", icon: Flame, tier: "silver", category: "tickets", target: 25, unit: "tickets", source: { type: "discovery-count", kind: "ticket" } },
  { id: "century", title: "Century", flavor: "One hundred tickets. A quiet kind of legend.", icon: Trophy, tier: "gold", category: "tickets", target: 100, unit: "tickets", source: { type: "discovery-count", kind: "ticket" } },
  { id: "ascendant", title: "Ascendant", flavor: "Five hundred. The sky remembers your name.", icon: Crown, tier: "mythic", category: "tickets", target: 500, unit: "tickets", source: { type: "discovery-count", kind: "ticket" } },
  { id: "overdue_slayer", title: "Overdue Slayer", flavor: "You cleared every overdue ticket. The queue exhales.", icon: Zap, tier: "gold", category: "tickets", target: 1, unit: "shift", source: { type: "overdue-clear" } },

  // Dispatch
  { id: "first_dispatch", title: "First Dispatch", flavor: "You opened the line. Someone answered.", icon: PhoneOutgoing, tier: "bronze", category: "dispatch", target: 1, unit: "session", source: { type: "discovery-count", kind: "dispatch" } },
  { id: "dispatch_cartographer", title: "Dispatch Cartographer", flavor: "Twenty-five calls mapped. You know the terrain now.", icon: Compass, tier: "silver", category: "dispatch", target: 25, unit: "sessions", source: { type: "discovery-count", kind: "dispatch" } },
  { id: "root_cause_whisperer", title: "Root-Cause Whisperer", flavor: "Fifty dispatches. The 'why' answers before you ask.", icon: Search, tier: "gold", category: "dispatch", target: 50, unit: "sessions", source: { type: "discovery-count", kind: "dispatch" } },

  // Knowledge
  { id: "archivist", title: "Archivist", flavor: "Ten notes filed. Future-you says thanks.", icon: BookOpen, tier: "bronze", category: "knowledge", target: 10, unit: "notes", source: { type: "knowledge-count" } },
  { id: "curator", title: "Curator", flavor: "Fifty notes. A library of hard-won answers.", icon: Library, tier: "gold", category: "knowledge", target: 50, unit: "notes", source: { type: "knowledge-count" } },
  { id: "snip_collector", title: "Snip Collector", flavor: "You've built a receipts folder the size of a shift.", icon: Scissors, tier: "silver", category: "knowledge", target: 100, unit: "notes", source: { type: "knowledge-count" } },

  // Consistency
  { id: "nightfall_initiate", title: "Nightfall Initiate", flavor: "A plan for the dark. That's half the battle.", icon: Moon, tier: "bronze", category: "consistency", target: 1, unit: "plan", source: { type: "discovery-count", kind: "night_plan" } },
  { id: "moonwalker", title: "Moonwalker", flavor: "Ten night plans. The dark is a room you know.", icon: MoonStar, tier: "silver", category: "consistency", target: 10, unit: "plans", source: { type: "discovery-count", kind: "night_plan" } },
  { id: "constant_star", title: "Constant Star", flavor: "Thirty plans. Reliable as gravity.", icon: Star, tier: "gold", category: "consistency", target: 30, unit: "plans", source: { type: "discovery-count", kind: "night_plan" } },

  // AI
  { id: "first_summary", title: "First Summary", flavor: "You let the model do the paperwork. It went fine.", icon: Wand2, tier: "bronze", category: "ai", target: 1, unit: "summary", source: { type: "discovery-count", kind: "cosmic" } },
  { id: "prompt_sculptor", title: "Prompt Sculptor", flavor: "You've shaped the machine as often as it's shaped your notes.", icon: Feather, tier: "gold", category: "ai", target: 100, unit: "summaries", source: { type: "discovery-count", kind: "cosmic" } },

  // Hidden / fun
  { id: "owl_hours", title: "Owl Hours", flavor: "Between 3 and 5 AM. The world is yours and the coffee.", icon: Bird, tier: "silver", category: "hidden", target: 1, unit: "session", source: { type: "night-hours" } },
  { id: "sanctuary_seeker", title: "Sanctuary Seeker", flavor: "You gave yourself five quiet minutes, five times over.", icon: HeartHandshake, tier: "bronze", category: "hidden", target: 5, unit: "visits", source: { type: "sanctuary-count" } },
  { id: "comeback_kid", title: "Comeback Kid", flavor: "Two weeks gone, and back at the console. Welcome home.", icon: Undo2, tier: "silver", category: "hidden", target: 1, unit: "return", source: { type: "discovery-count", kind: "shift" } },
];

export const TIER_COLOR: Record<AchievementTier, string> = {
  bronze: "oklch(0.72 0.12 55)",
  silver: "oklch(0.85 0.03 240)",
  gold: "oklch(0.85 0.15 90)",
  mythic: "oklch(0.78 0.2 300)",
};

export const TIER_LABEL: Record<AchievementTier, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  mythic: "Mythic",
};

export const CATEGORY_LABEL: Record<AchievementCategory, string> = {
  tickets: "Ticket Flow",
  dispatch: "Dispatch",
  knowledge: "Knowledge",
  consistency: "Consistency",
  ai: "AI & Tooling",
  hidden: "Hidden",
};

export function achievementById(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}