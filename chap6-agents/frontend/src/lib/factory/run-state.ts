/** What the factory shows for one run: a pure reducer over the events the runner hook dispatches. */
import { AGENT_IDS, AGENT_LABELS, type AgentId } from "@/lib/agents";
import type { AgentStep } from "@/lib/chat-stream-contract";
import { STATIONS, type StationId, type TrackId } from "./layout";
import { pairTracks, routeFor } from "./route";

export type StationState = "idle" | "active" | "done" | "skipped" | "fallback" | "error";

export interface LogEntry {
  turn: number;
  /** Null when the event named no known station. */
  station: StationId | null;
  level: "info" | "fallback" | "error";
  text: string;
}

export interface RunState {
  turn: number;
  stations: Record<StationId, StationState>;
  litTracks: TrackId[];
  current: StationId | null;
  caption: string;
  log: LogEntry[];
  lastSteps: Partial<Record<AgentId, AgentStep>>;
}

export type RunEvent =
  | { type: "start"; turn: number }
  | { type: "step"; step: AgentStep }
  | { type: "agentError"; node: string; errorType: string }
  | { type: "streamError"; message: string }
  | { type: "finish"; awaitingIntake: boolean }
  | { type: "reset" };

const IDLE_CAPTION = "Nhà máy đang chờ tin nhắn.";
const agentIds = new Set<string>(AGENT_IDS);
const isAgent = (id: string): id is AgentId => agentIds.has(id);

function idleStations(): Record<StationId, StationState> {
  return Object.fromEntries(Object.keys(STATIONS).map((id) => [id, "idle"])) as Record<StationId, StationState>;
}

export function initialRunState(): RunState {
  return { turn: 0, stations: idleStations(), litTracks: [], current: null, caption: IDLE_CAPTION, log: [], lastSteps: {} };
}

/** Agents this turn has reached, in graph order (knowledge never shares a turn with intake/risk/advisor). */
function visited(stations: Record<StationId, StationState>): AgentId[] {
  return AGENT_IDS.filter((id) => stations[id] !== "idle" && stations[id] !== "skipped");
}

const settle = (state: StationState): StationState => (state === "active" ? "done" : state);

function withLog(state: RunState, entry: Omit<LogEntry, "turn">, caption: string): RunState {
  return { ...state, caption, log: [...state.log, { turn: state.turn, ...entry }] };
}

function onStep(state: RunState, step: AgentStep): RunState {
  const label = isAgent(step.agent) ? AGENT_LABELS[step.agent] : step.label || step.agent;
  const fellBack = typeof step.fallback === "string" && step.fallback.length > 0;
  const text = `${label}: ${step.summary || "đã xử lý"}${fellBack ? ` (dự phòng: ${step.fallback})` : ""}`;
  if (!isAgent(step.agent)) {
    return withLog(state, { station: null, level: "info", text: `Bước không rõ trạm (${step.agent}). ${text}` }, text);
  }
  const stations = { ...state.stations, gate: settle(state.stations.gate) };
  if (state.current && state.current !== step.agent) stations[state.current] = settle(stations[state.current]);
  if (stations[step.agent] !== "error") stations[step.agent] = fellBack ? "fallback" : "active";
  const next: RunState = {
    ...state,
    stations,
    current: step.agent,
    litTracks: ["in", ...pairTracks(visited(stations))],
    lastSteps: { ...state.lastSteps, [step.agent]: step },
  };
  return withLog(next, { station: step.agent, level: fellBack ? "fallback" : "info", text }, text);
}

export function reduce(state: RunState, event: RunEvent): RunState {
  switch (event.type) {
    case "reset":
      return initialRunState();
    case "start": {
      const stations = { ...idleStations(), gate: "active" as const };
      const caption = `Lượt ${event.turn}: tin nhắn vào cổng.`;
      return withLog({ ...state, turn: event.turn, stations, litTracks: [], current: "gate" }, { station: "gate", level: "info", text: caption }, caption);
    }
    case "step":
      return onStep(state, event.step);
    case "agentError": {
      const node = isAgent(event.node) ? event.node : null;
      const where = node ? AGENT_LABELS[node] : `nút ${event.node}`;
      const text = `${where} gặp lỗi ${event.errorType}.`;
      const next = node ? { ...state, stations: { ...state.stations, [node]: "error" as const }, current: node } : state;
      return withLog(next, { station: node, level: "error", text }, text);
    }
    case "streamError": {
      const text = `Luồng bị lỗi: ${event.message}`;
      const current = state.current;
      const next = current ? { ...state, stations: { ...state.stations, [current]: "error" as const } } : state;
      return withLog(next, { station: current, level: "error", text }, text);
    }
    case "finish": {
      const stations = { ...state.stations };
      for (const id of Object.keys(stations) as StationId[]) {
        if (id === "exit") stations.exit = stations.exit === "error" ? "error" : "done";
        else if (id === "memory") stations.memory = event.awaitingIntake ? "done" : "skipped";
        else stations[id] = stations[id] === "idle" ? "skipped" : settle(stations[id]);
      }
      const path = visited(stations);
      const litTracks = path.length ? routeFor(path, { loopsBack: event.awaitingIntake }) : [];
      const text = event.awaitingIntake
        ? `Lượt ${state.turn} dừng ở bước thu thập: chờ người dùng bổ sung thông tin.`
        : `Lượt ${state.turn} hoàn tất.`;
      return withLog({ ...state, stations, litTracks, current: null }, { station: "exit", level: "info", text }, text);
    }
  }
}
