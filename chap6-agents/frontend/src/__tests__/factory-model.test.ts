import { describe, expect, it } from "vitest";

import { AGENT_IDS, type AgentId } from "@/lib/agents";
import type { AgentStep } from "@/lib/chat-stream-contract";
import { STATIONS, TOOL_STATION, TRACKS, type TrackId } from "@/lib/factory/layout";
import { githubLink, vscodeLink } from "@/lib/factory/links";
import { routeFor } from "@/lib/factory/route";
import { initialRunState, reduce, type RunEvent, type RunState } from "@/lib/factory/run-state";

const step = (agent: string, extra: Partial<AgentStep> = {}): AgentStep => ({
  agent, label: agent, summary: `tóm tắt ${agent}`, tools: [], ms: 5, ...extra,
});

const play = (events: RunEvent[], from: RunState = initialRunState()) => events.reduce(reduce, from);

describe("layout", () => {
  it("has a station for every agent plus gate, exit and memory", () => {
    for (const id of [...AGENT_IDS, "gate", "exit", "memory"] as const) expect(STATIONS[id]).toBeDefined();
  });

  it("orders the main line left to right with knowledge in front of intake", () => {
    const order = ["gate", "safety_in", "orchestrator", "intake", "risk", "advisor", "safety_out", "exit"] as const;
    order.slice(1).forEach((id, i) => expect(STATIONS[id].u).toBeGreaterThan(STATIONS[order[i]].u));
    expect(STATIONS.knowledge.v).toBeLessThan(STATIONS.intake.v);
  });

  it("joins existing stations with every track", () => {
    for (const track of Object.values(TRACKS)) {
      expect(STATIONS[track.from]).toBeDefined();
      expect(STATIONS[track.to]).toBeDefined();
    }
  });

  it("maps the seven backend tools to the node that calls them", () => {
    expect(TOOL_STATION).toEqual({
      compute_bmi: "intake", validate_profile: "intake",
      predict_diabetes_risk: "risk", predict_diabetes_type: "risk",
      search_knowledge: "knowledge", search_passages: "knowledge",
      get_recommendations: "advisor",
    });
  });
});

describe("routeFor", () => {
  it("routes an emergency straight to the exit check", () => {
    expect(routeFor(["safety_in", "safety_out"], { loopsBack: false })).toEqual(["in", "emergency", "out"]);
  });

  it("routes missing fields out and loops back", () => {
    expect(routeFor(["safety_in", "orchestrator", "intake", "safety_out"], { loopsBack: true }))
      .toEqual(["in", "main1", "toIntake", "missing", "out", "loop"]);
  });

  it("routes a knowledge question through the front line", () => {
    expect(routeFor(["safety_in", "orchestrator", "knowledge", "safety_out"], { loopsBack: false }))
      .toEqual(["in", "main1", "toKnowledge", "knowledgeOut", "out"]);
  });

  it("routes a full risk assessment and a direct reply", () => {
    expect(routeFor(["safety_in", "orchestrator", "intake", "risk", "advisor", "safety_out"], { loopsBack: false }))
      .toEqual(["in", "main1", "toIntake", "toRisk", "toAdvisor", "toSafeOut", "out"]);
    expect(routeFor(["safety_in", "orchestrator", "safety_out"], { loopsBack: false })).toEqual(["in", "main1", "direct", "out"]);
  });

  it("ignores unknown agents and skips pairs with no track", () => {
    expect(routeFor(["safety_in", "bogus" as AgentId, "orchestrator", "knowledge", "safety_out"], { loopsBack: false }))
      .toEqual(["in", "main1", "toKnowledge", "knowledgeOut", "out"]);
    expect(routeFor(["safety_in", "risk", "safety_out"], { loopsBack: false })).toEqual(["in", "out"]);
  });

  it("only returns tracks that exist", () => {
    const route = routeFor(["safety_in", "orchestrator", "intake", "safety_out"], { loopsBack: true });
    route.forEach((t: TrackId) => expect(TRACKS[t]).toBeDefined());
  });
});

describe("reduce", () => {
  it("marks a station that fell back", () => {
    const s = play([{ type: "start", turn: 1 }, { type: "step", step: step("safety_in") }, { type: "step", step: step("orchestrator", { fallback: "rules" }) }]);
    expect(s.stations.orchestrator).toBe("fallback");
    expect(s.stations.safety_in).toBe("done");
    expect(s.current).toBe("orchestrator");
    expect(s.caption).toContain("dự phòng");
    expect(s.lastSteps.orchestrator?.fallback).toBe("rules");
  });

  it("does not mark a null fallback", () => {
    const s = play([{ type: "start", turn: 1 }, { type: "step", step: step("orchestrator", { fallback: null }) }]);
    expect(s.stations.orchestrator).toBe("active");
  });

  it("skips the stations a knowledge turn never visited", () => {
    const s = play([
      { type: "start", turn: 1 },
      ...["safety_in", "orchestrator", "knowledge", "safety_out"].map((a): RunEvent => ({ type: "step", step: step(a) })),
      { type: "finish", awaitingIntake: false },
    ]);
    expect(s.stations.intake).toBe("skipped");
    expect(s.stations.risk).toBe("skipped");
    expect(s.stations.advisor).toBe("skipped");
    expect(s.stations.knowledge).toBe("done");
    expect(s.stations.safety_out).toBe("done");
    expect(s.litTracks).toEqual(["in", "main1", "toKnowledge", "knowledgeOut", "out"]);
    expect(s.current).toBeNull();
  });

  it("lights tracks as steps arrive and loops back when intake waits", () => {
    let s = play([{ type: "start", turn: 2 }, { type: "step", step: step("safety_in") }, { type: "step", step: step("orchestrator") }]);
    expect(s.litTracks).toEqual(["in", "main1"]);
    s = play([{ type: "step", step: step("intake") }, { type: "step", step: step("safety_out") }, { type: "finish", awaitingIntake: true }], s);
    expect(s.litTracks).toEqual(["in", "main1", "toIntake", "missing", "out", "loop"]);
    expect(s.turn).toBe(2);
  });

  it("marks the node an agent.error names", () => {
    const s = play([{ type: "start", turn: 1 }, { type: "step", step: step("intake") }, { type: "agentError", node: "risk", errorType: "ValueError" }]);
    expect(s.stations.risk).toBe("error");
    expect(s.log.at(-1)?.level).toBe("error");
  });

  it("keeps an error through finish", () => {
    const s = play([{ type: "start", turn: 1 }, { type: "agentError", node: "risk", errorType: "ValueError" }, { type: "finish", awaitingIntake: false }]);
    expect(s.stations.risk).toBe("error");
  });

  it("puts a stream error on the current station", () => {
    const s = play([{ type: "start", turn: 1 }, { type: "step", step: step("knowledge") }, { type: "streamError", message: "mất kết nối" }]);
    expect(s.stations.knowledge).toBe("error");
    expect(s.caption).toContain("mất kết nối");
  });

  it("never throws on unknown agents, missing code or unknown tools", () => {
    const events: RunEvent[] = [
      { type: "start", turn: 1 },
      { type: "step", step: step("ghost", { tools: [{ name: "nope", args: {}, result: null }] }) },
      { type: "step", step: step("risk", { tools: [{ name: "mystery", args: {}, result: 1 }] }) },
      { type: "agentError", node: "ghost", errorType: "KeyError" },
      { type: "streamError", message: "x" },
      { type: "finish", awaitingIntake: false },
    ];
    expect(() => play(events)).not.toThrow();
    const s = play(events);
    expect(s.stations.risk).toBe("error");
    expect(Object.keys(s.stations)).not.toContain("ghost");
  });

  it("starts a new turn clean but keeps the log; reset clears everything", () => {
    let s = play([{ type: "start", turn: 1 }, { type: "step", step: step("safety_in") }, { type: "finish", awaitingIntake: false }]);
    s = reduce(s, { type: "start", turn: 2 });
    expect(s.stations.safety_in).toBe("idle");
    expect(s.litTracks).toEqual([]);
    expect(s.log.length).toBeGreaterThan(0);
    expect(reduce(s, { type: "reset" })).toEqual(initialRunState());
  });

  it("routes an emergency turn from the entry check straight to the exit check", () => {
    const s = play([
      { type: "start", turn: 1 },
      { type: "step", step: step("safety_in") },
      { type: "step", step: step("safety_out") },
      { type: "finish", awaitingIntake: false },
    ]);
    expect(s.litTracks).toEqual(["in", "emergency", "out"]);
    expect(s.stations.orchestrator).toBe("skipped");
    expect(s.stations.safety_in).toBe("done");
    expect(s.stations.exit).toBe("done");
    expect(s.stations.memory).toBe("skipped");
  });

  it("starts a second turn clean after a turn that waits on intake", () => {
    let s = play([
      { type: "start", turn: 1 },
      ...["safety_in", "orchestrator", "intake", "safety_out"].map((a): RunEvent => ({ type: "step", step: step(a) })),
      { type: "finish", awaitingIntake: true },
    ]);
    expect(s.stations.memory).toBe("done");
    s = reduce(s, { type: "start", turn: 2 });
    expect(s.turn).toBe(2);
    expect(s.stations.memory).toBe("idle");
    expect(s.stations.exit).toBe("idle");
    expect(s.stations.gate).toBe("active");
    expect(s.litTracks).toEqual([]);
    s = play(["safety_in", "orchestrator", "intake"].map((a): RunEvent => ({ type: "step", step: step(a) })), s);
    expect(s.stations.intake).toBe("active");
    expect(s.litTracks).toEqual(["in", "main1", "toIntake"]);
  });

  it("settles the previous station and relights the belts when an agent errors", () => {
    const s = play([
      { type: "start", turn: 1 },
      { type: "step", step: step("safety_in") },
      { type: "step", step: step("orchestrator") },
      { type: "agentError", node: "knowledge", errorType: "RuntimeError" },
    ]);
    expect(s.stations.orchestrator).toBe("done");
    expect(s.stations.knowledge).toBe("error");
    expect(s.current).toBe("knowledge");
    expect(s.litTracks).toEqual(["in", "main1", "toKnowledge"]);
    expect(Object.values(s.stations)).not.toContain("active");
  });

  it("does not light the exit when a turn finishes after an error", () => {
    const s = play([
      { type: "start", turn: 1 },
      { type: "step", step: step("safety_in") },
      { type: "step", step: step("orchestrator") },
      { type: "agentError", node: "knowledge", errorType: "RuntimeError" },
      { type: "finish", awaitingIntake: false },
    ]);
    expect(s.litTracks).toEqual(["in", "main1", "toKnowledge"]);
    expect(s.litTracks).not.toContain("out");
    expect(s.stations.exit).not.toBe("done");
    expect(s.stations.safety_out).toBe("skipped");
    expect(s.stations.knowledge).toBe("error");
  });

  it("stops a cancelled turn without marking errors or leaving anything active", () => {
    const s = play([
      { type: "start", turn: 1 },
      { type: "step", step: step("safety_in") },
      { type: "step", step: step("orchestrator") },
      { type: "cancel" },
    ]);
    expect(Object.values(s.stations)).not.toContain("active");
    expect(Object.values(s.stations)).not.toContain("error");
    expect(s.stations.safety_in).toBe("done");
    expect(s.current).toBeNull();
    expect(s.caption).toContain("dừng");
  });

  it("does not mutate the previous state", () => {
    const a = initialRunState();
    const b = reduce(a, { type: "step", step: step("safety_in") });
    expect(a.stations.safety_in).toBe("idle");
    expect(b.stations.safety_in).toBe("active");
  });
});

describe("links", () => {
  it("builds a GitHub link with encoded path, falling back to main", () => {
    expect(githubLink("abc", { path: "a b/c.py", line: 7 })).toBe("https://github.com/thanhtrnnn/diabeque/blob/abc/a%20b/c.py#L7");
    expect(githubLink(null, { path: "x.py", line: 1 })).toBe("https://github.com/thanhtrnnn/diabeque/blob/main/x.py#L1");
    expect(githubLink(undefined, { path: "x.py", line: 1 })).toBe("https://github.com/thanhtrnnn/diabeque/blob/main/x.py#L1");
  });

  it("builds a VS Code link with the root encoded too", () => {
    expect(vscodeLink(undefined, { path: "x.py", line: 1 })).toBeNull();
    expect(vscodeLink("/Users/quant/Desktop/Thanh Tran/diabeque", { path: "chap6-agents/backend/app/agents/nodes.py", line: 127 }))
      .toBe("vscode://file/Users/quant/Desktop/Thanh%20Tran/diabeque/chap6-agents/backend/app/agents/nodes.py:127");
    expect(vscodeLink("/repo/", { path: "a b.py", line: 3 })).toBe("vscode://file/repo/a%20b.py:3");
  });
});
