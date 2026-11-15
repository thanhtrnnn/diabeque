/**
 * What each factory character should be doing for a given `RunState`: mood, the switch-operator's rail, the
 * record-keeper's field count, the elder's balance, the miner's lift, the inspector's stamp. Pure, no three.js,
 * so the rules are testable in jsdom; the rigs in `components/factory/characters.ts` only act them out.
 */
import { AGENT_IDS, type AgentId } from "@/lib/agents";
import type { AgentStep } from "@/lib/chat-stream-contract";
import type { StationId, TrackId } from "./layout";
import type { RunState } from "./run-state";

export type Mood = "idle" | "work" | "alarm" | "hover";

/** The three exits of the orchestrator's rail switch, in lever order (front, main line, back). */
export const SWITCH_TRACKS = ["toKnowledge", "toIntake", "direct"] as const satisfies readonly TrackId[];
export type SwitchTrack = (typeof SWITCH_TRACKS)[number];

/** Fields the intake agent needs before risk can run (`backend/app/agents/fields.py::REQUIRED`). */
export const REQUIRED_FIELDS = 7;

/** Intent names as the backend writes them (`Ý định: knowledge (...)`) and as the dev fixtures phrase them. */
const INTENT_TRACK: Array<[RegExp, SwitchTrack]> = [
  [/\b(knowledge)\b|hỏi kiến thức/i, "toKnowledge"],
  [/\b(assess_risk)\b|đánh giá nguy cơ/i, "toIntake"],
  [/\b(greeting|out_of_scope)\b|chào hỏi|ngoài phạm vi/i, "direct"],
];

const ran = (state: RunState, id: StationId) => state.stations[id] !== "idle" && state.stations[id] !== "skipped";

/** The gatekeeper caught an emergency this turn: the emergency belt is lit or the entry check said so. */
export function isEmergency(state: RunState): boolean {
  if (state.litTracks.includes("emergency")) return true;
  const step = state.lastSteps.safety_in;
  return ran(state, "safety_in") && !!step && /phát hiện.*(khẩn cấp|cấp cứu)/i.test(step.summary);
}

/**
 * Which exit the switch is thrown to. It follows the orchestrator's decision as soon as its step arrives, so
 * the lever moves one step before the sweet rolls onto the branch; a lit branch belt settles any doubt.
 */
export function switchTarget(state: RunState): SwitchTrack | null {
  for (const track of SWITCH_TRACKS) if (state.litTracks.includes(track)) return track;
  const step = state.lastSteps.orchestrator;
  if (!step || !ran(state, "orchestrator")) return null;
  const intent = step.summary.match(/Ý định:\s*([^.;(]+)/i)?.[1] ?? "";
  for (const [pattern, track] of INTENT_TRACK) if (pattern.test(intent)) return track;
  return null;
}

/** Fields the record-keeper has written down, from the intake step: "4/7", "còn thiếu A, B", "đủ 7", or the tool result. */
export function fieldsCount(step: AgentStep | undefined): number | null {
  if (!step) return null;
  const clamp = (n: number) => Math.max(0, Math.min(REQUIRED_FIELDS, n));
  const ratio = step.summary.match(/(\d+)\s*\/\s*7\b/);
  if (ratio) return clamp(Number(ratio[1]));
  const missing = step.summary.match(/còn thiếu\s+([^;.]+)/i);
  if (missing) return clamp(REQUIRED_FIELDS - missing[1].split(",").filter((s) => s.trim()).length);
  if (/(^|\s)đủ(\s|$)/i.test(step.summary)) return REQUIRED_FIELDS;
  const checked = step.tools.find((t) => t.name === "validate_profile")?.result as { profile?: Record<string, unknown> } | undefined;
  if (checked && typeof checked === "object" && checked.profile && typeof checked.profile === "object") {
    return clamp(Object.keys(checked.profile).length);
  }
  return null;
}

/**
 * Probability that the profile falls in a diabetes group (pre-diabetes or diabetes), from the risk tool's
 * population-corrected probabilities, else its raw ones, else the first percentage in the step summary.
 */
export function riskShare(step: AgentStep | undefined): number | null {
  if (!step) return null;
  const result = step.tools.find((t) => t.name === "predict_diabetes_risk")?.result as
    | { probs?: Record<string, number>; probs_population?: Record<string, number> | null }
    | undefined;
  const probs = result && typeof result === "object" ? (result.probs_population ?? result.probs) : undefined;
  if (probs && typeof probs["0"] === "number") return Math.max(0, Math.min(1, 1 - probs["0"]));
  const pct = step.summary.match(/(\d+(?:[.,]\d+)?)\s*%/);
  return pct ? Math.max(0, Math.min(1, Number(pct[1].replace(",", ".")) / 100)) : null;
}

/** The exit check stripped a dosage sentence (`safety_flags` carries `dosage_removed`). */
export function dosageRemoved(state: RunState): boolean {
  const step = state.lastSteps.safety_out;
  return ran(state, "safety_out") && !!step && /dosage_removed/.test(step.summary);
}

export interface CastCues {
  moods: Record<AgentId, Mood>;
  /** Index into `SWITCH_TRACKS`, or -1 for the parked switch. */
  switchIndex: number;
  /** Rule book open in the switch-operator's hands: the orchestrator ran on rules because the LLM was down. */
  ruleBook: boolean;
  fields: number;
  /** 0..1, or null for a level balance (no reading this turn). */
  tilt: number | null;
  /** The miner is down in the cellar with the headlamp on (from the knowledge step to the end of the turn). */
  minerBelow: boolean;
  /** The inspector's stamp this turn: null before the exit check ran. */
  stamp: "ok" | "removed" | null;
}

/** Mood per character: error or emergency → alarm, the running agent → work, hover only lifts an idle one. */
export function moodFor(id: AgentId, state: RunState, hovered: StationId | null): Mood {
  const s = state.stations[id];
  if (s === "error") return "alarm";
  if (id === "safety_in" && isEmergency(state)) return "alarm";
  if (s === "active" || (s === "fallback" && state.current === id)) return "work";
  return hovered === id ? "hover" : "idle";
}

export function castCues(state: RunState, hovered: StationId | null = null): CastCues {
  const moods = Object.fromEntries(AGENT_IDS.map((id) => [id, moodFor(id, state, hovered)])) as Record<AgentId, Mood>;
  const target = switchTarget(state);
  return {
    moods,
    switchIndex: target ? SWITCH_TRACKS.indexOf(target) : -1,
    ruleBook: state.stations.orchestrator === "fallback",
    fields: ran(state, "intake") ? (fieldsCount(state.lastSteps.intake) ?? 0) : 0,
    tilt: ran(state, "risk") ? riskShare(state.lastSteps.risk) : null,
    // Steps arrive when an agent has finished, so a moment as "active" is too short for the lift: the miner
    // stays below from the knowledge step until the turn ends, then rides back up.
    minerBelow: ran(state, "knowledge") && state.current !== null,
    stamp: ran(state, "safety_out") ? (dosageRemoved(state) ? "removed" : "ok") : null,
  };
}
