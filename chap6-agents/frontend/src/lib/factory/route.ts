import { AGENT_IDS, type AgentId } from "@/lib/agents";
import type { TrackId } from "./layout";

const known = new Set<string>(AGENT_IDS);

const PAIR_TRACK: Record<string, TrackId> = {
  "safety_in>orchestrator": "main1",
  "safety_in>safety_out": "emergency",
  "orchestrator>intake": "toIntake",
  "orchestrator>knowledge": "toKnowledge",
  "orchestrator>safety_out": "direct",
  "intake>risk": "toRisk",
  "intake>safety_out": "missing",
  "risk>rules": "toRules",
  "rules>advisor": "toAdvisor",
  "safety_out>audit": "toAudit",
  "advisor>safety_out": "toSafeOut",
  "knowledge>safety_out": "knowledgeOut",
};

/** Tracks between consecutive known agents; unknown agents are dropped and pairs with no track skipped. */
export function pairTracks(agents: readonly string[]): TrackId[] {
  const path = agents.filter((agent) => known.has(agent));
  const tracks: TrackId[] = [];
  for (let i = 1; i < path.length; i++) {
    const track = PAIR_TRACK[`${path[i - 1]}>${path[i]}`];
    if (track) tracks.push(track);
  }
  return tracks;
}

/** The belts a turn's candy rides, in order: in, the agent pairs, out, then loop when intake waits for the user. */
export function routeFor(agents: AgentId[], opts: { loopsBack: boolean }): TrackId[] {
  return ["in", ...pairTracks(agents), "out", ...(opts.loopsBack ? (["loop"] as const) : [])];
}
