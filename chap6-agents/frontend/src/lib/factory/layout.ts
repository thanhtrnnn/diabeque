/** Static geometry of the candy works: where each station stands and which belts join them. No three.js here. */
import type { AgentId } from "@/lib/agents";

export type StationId = AgentId | "gate" | "exit" | "memory";
export type StationKind = "code" | "llm" | "prop";

/** `u` runs left to right along the main line, `v` front (negative) to back (positive). */
export const STATIONS: Record<StationId, { u: number; v: number; kind: StationKind }> = {
  gate: { u: 0, v: 0, kind: "prop" },
  safety_in: { u: 1, v: 0, kind: "code" },
  orchestrator: { u: 2, v: 0, kind: "llm" },
  intake: { u: 3, v: 0, kind: "llm" },
  knowledge: { u: 3, v: -2, kind: "llm" },
  risk: { u: 4, v: 0, kind: "code" },
  rules: { u: 5, v: 0, kind: "code" },
  advisor: { u: 6, v: 0, kind: "llm" },
  safety_out: { u: 7, v: 0, kind: "code" },
  audit: { u: 8, v: 0, kind: "code" },
  exit: { u: 9, v: 0, kind: "prop" },
  /** The conversation's stored profile, behind intake: where a waiting turn parks. */
  memory: { u: 3, v: 3, kind: "prop" },
};

export type TrackId =
  | "in" | "main1" | "toIntake" | "toRisk" | "toRules" | "toAdvisor" | "toSafeOut" | "toAudit" | "out"
  | "emergency" | "direct" | "toKnowledge" | "knowledgeOut" | "missing" | "loop";

/**
 * `via` holds the bends between the two stations, endpoints excluded. Back lanes: direct v=1, missing v=1.5,
 * emergency v=2, loop v=3. The three back lanes drop into the exit check side by side (u 6.7 / 7 / 7.3) so their
 * last legs never lie on top of each other.
 */
export const TRACKS: Record<TrackId, { from: StationId; to: StationId; via: Array<[number, number]> }> = {
  in: { from: "gate", to: "safety_in", via: [] },
  main1: { from: "safety_in", to: "orchestrator", via: [] },
  toIntake: { from: "orchestrator", to: "intake", via: [] },
  toRisk: { from: "intake", to: "risk", via: [] },
  toRules: { from: "risk", to: "rules", via: [] },
  toAdvisor: { from: "rules", to: "advisor", via: [] },
  toSafeOut: { from: "advisor", to: "safety_out", via: [] },
  toAudit: { from: "safety_out", to: "audit", via: [] },
  out: { from: "audit", to: "exit", via: [] },
  emergency: { from: "safety_in", to: "safety_out", via: [[1, 2], [7.3, 2], [7.3, 0.35]] },
  direct: { from: "orchestrator", to: "safety_out", via: [[2, 1], [6.7, 1], [6.7, 0.35]] },
  toKnowledge: { from: "orchestrator", to: "knowledge", via: [[2, -2]] },
  knowledgeOut: { from: "knowledge", to: "safety_out", via: [[7, -2]] },
  missing: { from: "intake", to: "safety_out", via: [[3, 1.5], [7, 1.5]] },
  loop: { from: "exit", to: "memory", via: [[9, 3]] },
};

/** Each tool in `backend/app/agents/tools.py::FUNCTIONS`, keyed to the node in `nodes.py` that calls it. */
export const TOOL_STATION: Record<string, AgentId> = {
  compute_bmi: "intake",
  validate_profile: "intake",
  predict_diabetes_risk: "risk",
  predict_diabetes_type: "risk",
  search_knowledge: "knowledge",
  search_passages: "knowledge",
  get_recommendations: "advisor",
  evaluate_rules: "rules",
  write_audit: "audit",
};
