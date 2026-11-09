import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CHAT_STREAM_EVENT_NAMES,
  ChatStreamProtocolError,
  DISCLAIMER,
  parseChatStreamAnswer,
  parseChatStreamEnvelope,
} from "@/lib/chat-stream-contract";
import { ANSWER_ID, DISCLAIMER_TEXT, answeredEvents, frames, refusalEvents } from "@/test/stream-fixtures";

const SCHEMA = resolve(process.cwd(), "../backend/app/schema.py");

function finalPayload(events = answeredEvents()) {
  const final = events.find(([name]) => name === "answer.final");
  return structuredClone(final?.[1].answer) as Record<string, unknown>;
}

describe("SSE contract", () => {
  it.skipIf(!existsSync(SCHEMA))("lists exactly the events of backend schema.SSE_EVENTS", () => {
    const source = readFileSync(SCHEMA, "utf8");
    const block = /SSE_EVENTS\s*=\s*\(([^)]*)\)/.exec(source)?.[1] ?? "";
    const backend = [...block.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    expect([...CHAT_STREAM_EVENT_NAMES]).toEqual(backend);
  });

  it.skipIf(!existsSync(SCHEMA))("mirrors backend schema.DISCLAIMER", () => {
    const source = readFileSync(SCHEMA, "utf8");
    const block = /DISCLAIMER\s*=\s*\(([^)]*)\)/.exec(source)?.[1] ?? "";
    const backend = [...block.matchAll(/"([^"]*)"/g)].map((match) => match[1]).join("");
    expect(DISCLAIMER).toBe(backend);
  });

  it("accepts the answered final payload the backend emits, including a +00:00 timestamp", () => {
    const parsed = parseChatStreamAnswer(finalPayload());
    expect(parsed?.state).toBe("answered");
    expect(parsed?.disclaimer).toBe(DISCLAIMER_TEXT);
    expect(parsed?.sections.map((section) => section.kind)).toEqual(["conclusion", "basis"]);
  });

  it.each(["out_of_scope", "insufficient_evidence"] as const)("accepts a %s refusal", (state) => {
    expect(parseChatStreamAnswer(finalPayload(refusalEvents(state)))?.state).toBe(state);
  });

  it("rejects an answered payload whose citation resolves to no source", () => {
    const payload = finalPayload();
    (payload.sources as Array<Record<string, unknown>>).forEach((source) => { source.citation_id = null; source.role = "context"; });
    expect(parseChatStreamAnswer(payload)).toBeNull();
  });

  it("rejects an answered payload without any citation", () => {
    const payload = finalPayload();
    payload.sections = [{ id: "conclusion", kind: "conclusion", title: "Trả lời", content: [{ type: "text", text: "Không dẫn nguồn." }] }];
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

  it("rejects an unknown event name, a seq/id mismatch and malformed data", () => {
    const envelope = { v: 1, seq: 1, request_id: "r", conversation_id: null, answer_id: null, timestamp: "2026-10-26T08:00:00Z", data: {} };
    expect(parseChatStreamEnvelope("stream.started", "1", envelope).event).toBe("stream.started");
    expect(() => parseChatStreamEnvelope("tool.started", "1", envelope)).toThrow(ChatStreamProtocolError);
    expect(() => parseChatStreamEnvelope("stream.started", "2", envelope)).toThrow(ChatStreamProtocolError);
    expect(() => parseChatStreamEnvelope("answer.text.delta", "1", { ...envelope, data: { section_id: "other", text_delta: "x" } })).toThrow(ChatStreamProtocolError);
  });

  it("frames carry the answer id on every envelope", () => {
    expect(frames(answeredEvents())).toContain(`"answer_id":"${ANSWER_ID}"`);
  });
});
