import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { AGENT_BRANCHES, AGENT_DETAILS, AGENT_IDS, AGENT_LABELS } from "@/lib/agents";
import { FIELD_LABELS } from "@/lib/agent-trace";

const BACKEND = resolve(process.cwd(), "../backend/app/agents");
const STATE = resolve(BACKEND, "state.py");
const GRAPH = resolve(BACKEND, "graph.py");
const FIELDS = resolve(BACKEND, "fields.py");

describe("static agent facts match the backend source", () => {
  it.skipIf(!existsSync(STATE))("lists the agent ids in the order of state.Agent", () => {
    const block = /class Agent\(StrEnum\):([\s\S]*?)\n\n/.exec(readFileSync(STATE, "utf8"))?.[1] ?? "";
    expect(AGENT_IDS).toEqual([...block.matchAll(/= "([a-z_]+)"/g)].map((match) => match[1]));
  });

  it.skipIf(!existsSync(STATE))("carries the labels of state.AGENT_LABELS", () => {
    const source = readFileSync(STATE, "utf8");
    const block = /AGENT_LABELS[^{]*\{([\s\S]*?)\n\}/.exec(source)?.[1] ?? "";
    const backend = [...block.matchAll(/Agent\.([A-Z_]+): "([^"]+)"/g)].map((match) => [match[1].toLowerCase(), match[2]]);
    expect(Object.entries(AGENT_LABELS).sort()).toEqual(backend.sort());
  });

  it.skipIf(!existsSync(GRAPH))("draws every conditional edge of graph.py and no other", () => {
    const source = readFileSync(GRAPH, "utf8");
    const routers = [...source.matchAll(/add_conditional_edges\(Agent\.([A-Z_]+), \w+, \[([^\]]*)\]\)/g)];
    const backend = routers.flatMap(([, from, targets]) =>
      [...targets.matchAll(/Agent\.([A-Z_]+)/g)].map((target) => `${from.toLowerCase()}>${target[1].toLowerCase()}`));
    expect(AGENT_BRANCHES.map((edge) => `${edge.from}>${edge.to}`).sort()).toEqual(backend.sort());
  });

  it.skipIf(!existsSync(FIELDS))("labels every required intake field", () => {
    const block = /REQUIRED = \[([^\]]*)\]/.exec(readFileSync(FIELDS, "utf8"))?.[1] ?? "";
    const required = [...block.matchAll(/"([A-Za-z]+)"/g)].map((match) => match[1]);
    expect(Object.keys(FIELD_LABELS).sort()).toEqual(required.sort());
  });

  it("describes every agent", () => {
    expect(Object.keys(AGENT_DETAILS).sort()).toEqual([...AGENT_IDS].sort());
    for (const id of AGENT_IDS) expect(AGENT_DETAILS[id].role.length).toBeGreaterThan(20);
  });
});
