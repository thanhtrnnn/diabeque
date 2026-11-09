import { describe, expect, it } from "vitest";

import { ChatStreamParser } from "@/lib/chat-stream-parser";
import { ChatStreamProtocolError, type ChatStreamEvent } from "@/lib/chat-stream-contract";
import { cancelChatStream, initialChatStreamState, reduceChatStream } from "@/lib/chat-stream-reducer";
import { CITATION_ID, answeredEvents, emergencyEvents, errorEvents, frames, needsInfoEvents, refusalEvents, riskEvents, type StreamEvent } from "@/test/stream-fixtures";

function parse(events: StreamEvent[]): ChatStreamEvent[] {
  const parser = new ChatStreamParser();
  return [...parser.push(new TextEncoder().encode(frames(events))), ...parser.finish()];
}

const run = (events: ChatStreamEvent[]) => events.reduce(reduceChatStream, initialChatStreamState);

describe("reduceChatStream", () => {
  it("builds the answered turn section by section and settles on answer.final", () => {
    const events = parse(answeredEvents());
    const beforeFinal = run(events.slice(0, events.findIndex((event) => event.event === "answer.final")));
    expect(beforeFinal.phase).toBe("revealing");
    expect(beforeFinal.sections.map((section) => section.id)).toEqual(["conclusion-1", "basis-2"]);
    expect(beforeFinal.sources.every((source) => source.citation_id === null)).toBe(true);
    expect(beforeFinal.sections.map((section) => [section.kind, section.completed])).toEqual([["conclusion", true], ["basis", true]]);
    expect(beforeFinal.sections[0].content).toEqual([
      { type: "text", text: "Nên ưu tiên ngũ cốc nguyên hạt và rau, hạn chế đồ uống có đường " },
      { type: "citation", citation_id: CITATION_ID, label: 1 },
      { type: "text", text: "." },
    ]);

    const done = run(events);
    expect(done).toMatchObject({ phase: "completed", terminal: true, finalAnswer: { state: "answered" } });
    expect(done.sources.find((source) => source.citation_id === CITATION_ID)?.role).toBe("supporting");
  });

  it("collects agent.step events as the agents finish, before any answer event", () => {
    const events = parse(answeredEvents());
    const firstAnswer = events.findIndex((event) => event.event === "sources.snapshot");
    const early = run(events.slice(0, firstAnswer));
    expect(early.phase).toBe("researching");
    expect(early.steps.map((step) => step.agent)).toEqual(["safety_in", "orchestrator", "knowledge", "safety_out"]);
    expect(early.steps[2]).toMatchObject({ label: "Tra cứu tri thức", ms: 5400, tools: [{ name: "search_knowledge" }] });
    expect(run(events).steps).toHaveLength(4);
  });

  it("settles a needs_info turn on its question section and keeps the steps", () => {
    const done = run(parse(needsInfoEvents()));
    expect(done.finalAnswer?.state).toBe("needs_info");
    expect(done.sections.map((section) => section.kind)).toEqual(["question"]);
    expect(done.steps.map((step) => step.agent)).toEqual(["safety_in", "orchestrator", "intake", "safety_out"]);
  });

  it("settles a risk turn with risk, advice and basis, and an emergency turn with one emergency section", () => {
    expect(run(parse(riskEvents())).sections.map((section) => section.id)).toEqual(["risk-1", "advice-2", "basis-3"]);
    const emergency = run(parse(emergencyEvents()));
    expect(emergency.finalAnswer?.state).toBe("emergency");
    expect(emergency.steps.map((step) => step.agent)).toEqual(["safety_in", "safety_out"]);
  });

  it("rejects an agent.step that arrives after answer.started", () => {
    const events = parse(answeredEvents());
    const step = events.find((event) => event.event === "agent.step") as ChatStreamEvent;
    const started = events.findIndex((event) => event.event === "answer.started");
    const late = { ...step, id: String(started + 2), envelope: { ...step.envelope, seq: started + 2 } };
    expect(() => run([...events.slice(0, started + 1), late])).toThrow(ChatStreamProtocolError);
  });

  it("rejects a section opened out of the announced order", () => {
    const events = parse(riskEvents());
    const swapped = events.map((event) => event.event === "answer.started"
      ? { ...event, envelope: { ...event.envelope, data: { state: "answered", section_order: ["advice", "risk", "basis"] } } }
      : event);
    expect(() => run(swapped)).toThrow(ChatStreamProtocolError);
  });

  it.each(["out_of_scope", "insufficient_evidence"] as const)("settles a %s turn with one notice section", (state) => {
    const done = run(parse(refusalEvents(state)));
    expect(done.finalAnswer?.state).toBe(state);
    expect(done.sections.map((section) => section.kind)).toEqual(["notice"]);
  });

  it("surfaces stream.error with the backend's retry verdict", () => {
    const done = run(parse(errorEvents(false)));
    expect(done).toMatchObject({ phase: "technical_error", error: "Lỗi xử lý, vui lòng thử lại.", errorRetryable: false, finalAnswer: null });
  });

  it("rejects a skipped sequence number", () => {
    const events = parse(answeredEvents());
    expect(() => run([events[0], events[2]])).toThrow(ChatStreamProtocolError);
  });

  it("rejects text for a section that was never opened", () => {
    const events = parse(answeredEvents());
    const delta = events.find((event) => event.event === "answer.text.delta") as ChatStreamEvent;
    expect(() => run([...events.slice(0, 3), { ...delta, id: "4", envelope: { ...delta.envelope, seq: 4 } }])).toThrow(ChatStreamProtocolError);
  });

  it("rejects stream.completed before a valid answer.final", () => {
    const events = parse(answeredEvents());
    const completed = events.at(-1) as ChatStreamEvent;
    expect(() => run([events[0], { ...completed, id: "2", envelope: { ...completed.envelope, seq: 2 } }])).toThrow(ChatStreamProtocolError);
  });

  it("rejects events after a terminal event", () => {
    const events = parse(errorEvents());
    expect(() => reduceChatStream(run(events), events[0])).toThrow(ChatStreamProtocolError);
  });

  it("cancelling drops the partial answer but keeps the steps already shown", () => {
    const events = parse(answeredEvents());
    const partial = run(events.slice(0, 12));
    expect(partial.sections.length).toBeGreaterThan(0);
    const cancelled = cancelChatStream(partial);
    expect(cancelled).toMatchObject({ phase: "cancelled", terminal: true, sections: [] });
    expect(cancelled.steps).toHaveLength(4);
  });
});
