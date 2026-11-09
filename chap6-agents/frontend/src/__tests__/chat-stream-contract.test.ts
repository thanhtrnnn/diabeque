import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ANSWER_STATES,
  CHAT_STREAM_EVENT_NAMES,
  ChatStreamProtocolError,
  DISCLAIMER,
  SECTION_KINDS,
  parseAgentInfo,
  parseChatStreamAnswer,
  parseChatStreamEnvelope,
} from "@/lib/chat-stream-contract";
import {
  ANSWER_ID,
  DISCLAIMER_TEXT,
  agentInfo,
  answeredEvents,
  emergencyEvents,
  frames,
  needsInfoEvents,
  refusalEvents,
  riskEvents,
} from "@/test/stream-fixtures";

const BACKEND = resolve(process.cwd(), "../backend/app");
const SCHEMA = resolve(BACKEND, "schema.py");
const MAIN = resolve(BACKEND, "main.py");
const NODES = resolve(BACKEND, "agents/nodes.py");
const present = existsSync(SCHEMA) && existsSync(MAIN) && existsSync(NODES);

const read = (path: string) => readFileSync(path, "utf8");
const names = (source: string, pattern: RegExp) => [...source.matchAll(pattern)].map((match) => match[1]);

function finalPayload(events = answeredEvents()) {
  const final = events.find(([name]) => name === "answer.final");
  return structuredClone(final?.[1].answer) as Record<string, unknown>;
}

describe("SSE contract against the backend source", () => {
  it.skipIf(!present)("lists the events of backend schema.SSE_EVENTS plus agent.step, and nothing the backend never emits", () => {
    const block = /SSE_EVENTS\s*=\s*\(([^)]*)\)/.exec(read(SCHEMA))?.[1] ?? "";
    const schemaEvents = names(block, /"([^"]+)"/g);
    const emitted = new Set([...names(read(MAIN), /yield "([a-z.]+)",/g), ...names(read(MAIN), /frame\("([a-z.]+)"/g)]);
    expect(emitted.has("agent.step")).toBe(true);
    expect([...CHAT_STREAM_EVENT_NAMES].sort()).toEqual([...new Set([...schemaEvents, "agent.step"])].sort());
    for (const event of emitted) expect(CHAT_STREAM_EVENT_NAMES).toContain(event);
  });

  it.skipIf(!present)("mirrors backend schema.DISCLAIMER", () => {
    const block = /DISCLAIMER\s*=\s*\(([^)]*)\)/.exec(read(SCHEMA))?.[1] ?? "";
    expect(DISCLAIMER).toBe(names(block, /"([^"]*)"/g).join(""));
  });

  it.skipIf(!present)("knows every answer state main.answer_state can return", () => {
    const body = /def answer_state[\s\S]*?\n\n\n/.exec(read(MAIN))?.[0] ?? "";
    expect([...ANSWER_STATES].sort()).toEqual([...new Set(names(body, /return "([a-z_]+)"/g))].sort());
  });

  it.skipIf(!present)("knows every section kind the agents write, plus basis", () => {
    const kinds = new Set([...names(read(NODES), /"kind": "([a-z]+)"/g), "basis"]);
    expect([...SECTION_KINDS].sort()).toEqual([...kinds].sort());
  });
});

describe("answer payload", () => {
  it("accepts the answered knowledge payload, with section ids in the kind-order form", () => {
    const parsed = parseChatStreamAnswer(finalPayload());
    expect(parsed?.state).toBe("answered");
    expect(parsed?.disclaimer).toBe(DISCLAIMER_TEXT);
    expect(parsed?.sections.map((section) => [section.id, section.kind])).toEqual([["conclusion-1", "conclusion"], ["basis-2", "basis"]]);
    expect(parsed?.agent.trace.map((step) => step.agent)).toEqual(["safety_in", "orchestrator", "knowledge", "safety_out"]);
  });

  it("accepts a needs_info payload with the collected profile and the missing fields", () => {
    const parsed = parseChatStreamAnswer(finalPayload(needsInfoEvents()));
    expect(parsed).toMatchObject({ state: "needs_info", evidence_state: "insufficient" });
    expect(parsed?.sections.map((section) => section.kind)).toEqual(["question"]);
    expect(parsed?.agent.profile.map((field) => field.display)).toEqual(["50-54", "Nam", "29.4", "có"]);
    expect(parsed?.agent.missing).toEqual(["HighChol", "PhysActivity", "GenHlth"]);
    expect(parsed?.agent.risk).toBeNull();
  });

  it("accepts a risk payload: answered, a cited advice section, risk with population probabilities and a warning", () => {
    const parsed = parseChatStreamAnswer(finalPayload(riskEvents()));
    expect(parsed?.state).toBe("answered");
    expect(parsed?.sections.map((section) => section.id)).toEqual(["risk-1", "advice-2", "basis-3"]);
    expect(parsed?.agent.risk?.probs_population).toEqual({ "0": 0.84, "1": 0.03, "2": 0.13 });
    expect(parsed?.warnings).toEqual([{ code: "dosage_removed", message: "Đã bỏ câu có liều thuốc." }]);
  });

  it("accepts an emergency payload", () => {
    expect(parseChatStreamAnswer(finalPayload(emergencyEvents()))).toMatchObject({ state: "emergency", agent: { safety_flags: ["emergency"] } });
  });

  it.each(["out_of_scope", "insufficient_evidence"] as const)("accepts a %s refusal", (state) => {
    expect(parseChatStreamAnswer(finalPayload(refusalEvents(state)))?.state).toBe(state);
  });

  it("accepts an answered payload with no citation when the evidence is insufficient (a greeting, or advice the gate dropped)", () => {
    const payload = finalPayload(riskEvents());
    payload.sections = [{ id: "risk-1", kind: "risk", title: "Ước lượng nguy cơ", content: [{ type: "text", text: "Không dẫn nguồn." }] }];
    payload.citations = [];
    payload.evidence_state = "insufficient";
    (payload.sources as Array<Record<string, unknown>>).forEach((source) => { source.citation_id = null; source.role = "context"; });
    expect(parseChatStreamAnswer(payload)?.state).toBe("answered");
  });

  it("accepts a null probs_population and rejects a malformed risk block", () => {
    const agent = finalPayload(riskEvents()).agent as Record<string, unknown>;
    (agent.risk as Record<string, unknown>).probs_population = null;
    expect(parseAgentInfo(agent)?.risk?.probs_population).toBeNull();
    (agent.risk as Record<string, unknown>).task = "other";
    expect(parseAgentInfo(agent)).toBeNull();
  });

  it("rejects a payload without the agent block, or with a trace step that has no label", () => {
    const missing = finalPayload();
    delete missing.agent;
    expect(parseChatStreamAnswer(missing)).toBeNull();
    const broken = finalPayload();
    (((broken.agent as Record<string, unknown>).trace as Array<Record<string, unknown>>)[0]).label = "";
    expect(parseChatStreamAnswer(broken)).toBeNull();
  });

  it("rejects a section whose id does not carry its kind", () => {
    const payload = finalPayload();
    (payload.sections as Array<Record<string, unknown>>)[0].id = "conclusion";
    expect(parseChatStreamAnswer(payload)).toBeNull();
    (payload.sections as Array<Record<string, unknown>>)[0].id = "risk-1";
    expect(parseChatStreamAnswer(payload)).toBeNull();
  });

  it("rejects an answered payload whose citation resolves to no source", () => {
    const payload = finalPayload();
    (payload.sources as Array<Record<string, unknown>>).forEach((source) => { source.citation_id = null; source.role = "context"; });
    expect(parseChatStreamAnswer(payload)).toBeNull();
  });

  it("rejects a payload that claims sufficient evidence without any citation", () => {
    const payload = finalPayload();
    payload.sections = [{ id: "conclusion-1", kind: "conclusion", title: "Trả lời", content: [{ type: "text", text: "Không dẫn nguồn." }] }];
    expect(parseChatStreamAnswer(payload)).toBeNull();
  });

  it("rejects a cited payload in a state other than answered", () => {
    const payload = finalPayload();
    payload.state = "needs_info";
    expect(parseChatStreamAnswer(payload)).toBeNull();
  });

  it("rejects a refusal that carries supporting sources", () => {
    const payload = finalPayload(refusalEvents("insufficient_evidence"));
    (payload.sources as Array<Record<string, unknown>>)[0].role = "supporting";
    (payload.sources as Array<Record<string, unknown>>)[0].citation_id = "x";
    expect(parseChatStreamAnswer(payload)).toBeNull();
  });

  it("rejects a source with an unknown retrieval branch or out-of-range score", () => {
    const branch = finalPayload();
    (branch.sources as Array<Record<string, unknown>>)[0].retrieved_by = ["tfidf"];
    expect(parseChatStreamAnswer(branch)).toBeNull();
    const score = finalPayload();
    (score.sources as Array<Record<string, unknown>>)[0].normalized_score = 1.4;
    expect(parseChatStreamAnswer(score)).toBeNull();
  });

  it("builds an agent info with sane defaults for the helper", () => {
    expect(parseAgentInfo(agentInfo())).toMatchObject({ trace: [], risk: null });
  });
});

describe("envelope", () => {
  const envelope = { v: 1, seq: 1, request_id: "r", conversation_id: null, answer_id: null, timestamp: "2026-10-26T08:00:00Z", data: {} };

  it("rejects an unknown event name, a seq/id mismatch and malformed data", () => {
    expect(parseChatStreamEnvelope("stream.started", "1", envelope).event).toBe("stream.started");
    expect(() => parseChatStreamEnvelope("tool.started", "1", envelope)).toThrow(ChatStreamProtocolError);
    expect(() => parseChatStreamEnvelope("stream.started", "2", envelope)).toThrow(ChatStreamProtocolError);
    expect(() => parseChatStreamEnvelope("answer.text.delta", "1", { ...envelope, data: { section_id: "other", text_delta: "x" } })).toThrow(ChatStreamProtocolError);
  });

  it("accepts agent.step with its tool calls and rejects one without a label, with a negative time or with a tool lacking args", () => {
    const step = { node: "intake", agent: "intake", label: "Thu thập thông tin", summary: "Ghi nhận 4 trường", ms: 516, tools: [{ name: "compute_bmi", args: { height_m: 1.65 }, result: { bmi: 29.4 } }] };
    expect(parseChatStreamEnvelope("agent.step", "1", { ...envelope, data: step }).event).toBe("agent.step");
    expect(() => parseChatStreamEnvelope("agent.step", "1", { ...envelope, data: { ...step, label: "" } })).toThrow(ChatStreamProtocolError);
    expect(() => parseChatStreamEnvelope("agent.step", "1", { ...envelope, data: { ...step, ms: -1 } })).toThrow(ChatStreamProtocolError);
    expect(() => parseChatStreamEnvelope("agent.step", "1", { ...envelope, data: { ...step, tools: [{ name: "x", result: 1 }] } })).toThrow(ChatStreamProtocolError);
  });

  it("requires a section id of the kind-order form that agrees with kind and order", () => {
    const data = { section_id: "risk-1", kind: "risk", title: "Ước lượng nguy cơ", order: 1 };
    expect(parseChatStreamEnvelope("answer.section.started", "1", { ...envelope, data }).event).toBe("answer.section.started");
    expect(() => parseChatStreamEnvelope("answer.section.started", "1", { ...envelope, data: { ...data, section_id: "risk" } })).toThrow(ChatStreamProtocolError);
    expect(() => parseChatStreamEnvelope("answer.section.started", "1", { ...envelope, data: { ...data, order: 2 } })).toThrow(ChatStreamProtocolError);
  });

  it("frames carry the answer id on every envelope", () => {
    expect(frames(answeredEvents())).toContain(`"answer_id":"${ANSWER_ID}"`);
  });
});
