/** Recorded agent runs the factory can replay offline; `scenarios.json` is written by `eval/record_scenarios.py`. */
import { parseAgentStep, type AgentStep } from "@/lib/chat-stream-contract";
import raw from "./scenarios.json";

export interface ScenarioSection {
  kind: string;
  title: string;
  text: string;
}

export interface ScenarioTurn {
  message: string;
  steps: AgentStep[];
  sections: ScenarioSection[];
}

export interface Scenario {
  id: string;
  label: string;
  turns: ScenarioTurn[];
}

export interface ScenarioFile {
  recorded_at: string | null;
  commit: string | null;
  scenarios: Scenario[];
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function parseSection(value: unknown): ScenarioSection | null {
  if (!record(value) || !text(value.kind) || typeof value.title !== "string" || typeof value.text !== "string") return null;
  return { kind: value.kind, title: value.title, text: value.text };
}

function parseTurn(value: unknown): ScenarioTurn | null {
  if (!record(value) || typeof value.message !== "string") return null;
  return {
    message: value.message,
    steps: list(value.steps).map(parseAgentStep).filter((step) => step !== null),
    sections: list(value.sections).map(parseSection).filter((section) => section !== null),
  };
}

function parseScenario(value: unknown): Scenario | null {
  if (!record(value) || !text(value.id) || !text(value.label)) return null;
  const turns = list(value.turns).map(parseTurn).filter((turn) => turn !== null);
  return turns.length ? { id: value.id, label: value.label, turns } : null;
}

/** Never throws: a malformed scenario, turn, step or section is dropped. */
export function parseScenarioFile(value: unknown): ScenarioFile {
  if (!record(value)) return { recorded_at: null, commit: null, scenarios: [] };
  return {
    recorded_at: text(value.recorded_at) ? value.recorded_at : null,
    commit: text(value.commit) ? value.commit : null,
    scenarios: list(value.scenarios).map(parseScenario).filter((scenario) => scenario !== null),
  };
}

export const SCENARIO_FILE: ScenarioFile = parseScenarioFile(raw);
export const SCENARIOS: Scenario[] = SCENARIO_FILE.scenarios;

/** A turn waits on intake when its answer ends by asking the user for more. */
export const awaitsIntake = (turn: ScenarioTurn): boolean => turn.sections.at(-1)?.kind === "question";
