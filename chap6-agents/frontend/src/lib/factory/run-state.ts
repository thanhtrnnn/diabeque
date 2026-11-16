/** What the factory shows for one run: a pure reducer over the events the runner hook dispatches. */
import { AGENT_IDS, AGENT_LABELS, type AgentId } from "@/lib/agents";
import type { AgentStep } from "@/lib/chat-stream-contract";
import { fallbackPhrase } from "./cast";
import { STATIONS, type StationId, type TrackId } from "./layout";
import { pairTracks, routeFor } from "./route";

export type StationState = "idle" | "active" | "done" | "skipped" | "fallback" | "error";

export interface LogEntry {
  turn: number;
  /** Null when the event named no known station. */
  station: StationId | null;
  level: "info" | "fallback" | "error";
  text: string;
  /** The agent step this entry reports, for the run log's agent / summary / ms / fallback columns. */
  step?: AgentStep;
}

/** One answer section as plain text (citations already rendered as [n]). */
export interface RunAnswerSection {
  kind: string;
  title: string;
  text: string;
}

export interface RunState {
  turn: number;
  /** The message this turn answers (empty for a turn with no recorded message). */
  question: string;
  /** The final answer of the turn, null until `finish` brings one. */
  answer: RunAnswerSection[] | null;
  stations: Record<StationId, StationState>;
  litTracks: TrackId[];
  current: StationId | null;
  caption: string;
  log: LogEntry[];
  lastSteps: Partial<Record<AgentId, AgentStep>>;
}

export type RunEvent =
  | { type: "start"; turn: number; question?: string }
  | { type: "step"; step: AgentStep }
  | { type: "agentError"; node: string; errorType: string }
  | { type: "streamError"; message: string }
  | { type: "finish"; awaitingIntake: boolean; sections?: RunAnswerSection[] }
  /** The runner stopped this turn on purpose (new question, new scenario, stop button): nothing failed. */
  | { type: "cancel" }
  | { type: "reset" };

const IDLE_CAPTION = "Nhà máy đang chờ tin nhắn.";
const agentIds = new Set<string>(AGENT_IDS);
const isAgent = (id: string): id is AgentId => agentIds.has(id);

function idleStations(): Record<StationId, StationState> {
  return Object.fromEntries(Object.keys(STATIONS).map((id) => [id, "idle"])) as Record<StationId, StationState>;
}

export function initialRunState(): RunState {
  return { turn: 0, question: "", answer: null, stations: idleStations(), litTracks: [], current: null, caption: IDLE_CAPTION, log: [], lastSteps: {} };
}

/** Agents this turn has reached, in graph order (knowledge never shares a turn with intake/risk/advisor). */
function visited(stations: Record<StationId, StationState>): AgentId[] {
  return AGENT_IDS.filter((id) => stations[id] !== "idle" && stations[id] !== "skipped");
}

const settle = (state: StationState): StationState => (state === "active" ? "done" : state);

const belts = (stations: Record<StationId, StationState>): TrackId[] => ["in", ...pairTracks(visited(stations))];

function withLog(state: RunState, entry: Omit<LogEntry, "turn">, caption: string): RunState {
  return { ...state, caption, log: [...state.log, { turn: state.turn, ...entry }] };
}

function onStep(state: RunState, step: AgentStep): RunState {
  const label = isAgent(step.agent) ? AGENT_LABELS[step.agent] : step.label || step.agent;
  const fellBack = typeof step.fallback === "string" && step.fallback.length > 0;
  const text = `${label}: ${step.summary || "đã xử lý"}${fellBack ? ` (${fallbackPhrase(step.fallback as string)})` : ""}`;
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
    litTracks: belts(stations),
    lastSteps: { ...state.lastSteps, [step.agent]: step },
  };
  return withLog(next, { station: step.agent, level: fellBack ? "fallback" : "info", text, step }, text);
}

export function reduce(state: RunState, event: RunEvent): RunState {
  switch (event.type) {
    case "reset":
      return initialRunState();
    case "start": {
      const stations = { ...idleStations(), gate: "active" as const };
      const caption = `Lượt ${event.turn}: tin nhắn vào cổng.`;
      const next = { ...state, turn: event.turn, question: event.question ?? "", answer: null, stations, litTracks: [], current: "gate" as const };
      return withLog(next, { station: "gate", level: "info", text: caption }, caption);
    }
    case "step":
      return onStep(state, event.step);
    case "agentError": {
      const node = isAgent(event.node) ? event.node : null;
      const where = node ? AGENT_LABELS[node] : `nút ${event.node}`;
      const text = `${where} gặp lỗi ${event.errorType}.`;
      if (!node) return withLog(state, { station: null, level: "error", text }, text);
      const stations = { ...state.stations, gate: settle(state.stations.gate) };
      if (state.current && state.current !== node) stations[state.current] = settle(stations[state.current]);
      stations[node] = "error";
      return withLog({ ...state, stations, current: node, litTracks: belts(stations) }, { station: node, level: "error", text }, text);
    }
    case "streamError": {
      const text = `Luồng bị lỗi: ${event.message}`;
      const current = state.current;
      const next = current ? { ...state, stations: { ...state.stations, [current]: "error" as const } } : state;
      return withLog(next, { station: current, level: "error", text }, text);
    }
    case "finish": {
      // A turn that hit an error never reached the exit check, whatever the stream says afterwards.
      const failed = Object.values(state.stations).includes("error");
      const waits = event.awaitingIntake && !failed;
      const stations = { ...state.stations };
      for (const id of Object.keys(stations) as StationId[]) {
        if (id === "exit") stations.exit = stations.exit === "error" ? "error" : failed ? "skipped" : "done";
        else if (id === "memory") stations.memory = waits ? "done" : "skipped";
        else stations[id] = stations[id] === "idle" ? "skipped" : settle(stations[id]);
      }
      const path = visited(stations);
      const litTracks = failed ? belts(stations) : path.length ? routeFor(path, { loopsBack: waits }) : [];
      const text = failed
        ? `Lượt ${state.turn} dừng vì lỗi.`
        : waits
          ? `Lượt ${state.turn} dừng ở bước thu thập: chờ người dùng bổ sung thông tin.`
          : `Lượt ${state.turn} hoàn tất.`;
      return withLog(
        { ...state, stations, litTracks, current: null, answer: event.sections?.length ? event.sections : state.answer },
        { station: failed ? null : "exit", level: failed ? "error" : "info", text },
        text,
      );
    }
    case "cancel": {
      const stations = { ...state.stations };
      for (const id of Object.keys(stations) as StationId[]) if (stations[id] === "active") stations[id] = "skipped";
      const text = `Lượt ${state.turn} đã dừng.`;
      return withLog({ ...state, stations, current: null }, { station: null, level: "info", text }, text);
    }
  }
}
