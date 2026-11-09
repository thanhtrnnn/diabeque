import { describe, expect, it } from "vitest";

import { ChatStreamParser } from "@/lib/chat-stream-parser";
import { ChatStreamProtocolError, type ChatStreamEvent } from "@/lib/chat-stream-contract";
import { cancelChatStream, initialChatStreamState, reduceChatStream } from "@/lib/chat-stream-reducer";
import { CITATION_ID, answeredEvents, errorEvents, frames, refusalEvents, type StreamEvent } from "@/test/stream-fixtures";

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

  it("cancelling drops the partial answer", () => {
    const events = parse(answeredEvents());
    const partial = run(events.slice(0, 8));
    expect(partial.sections.length).toBeGreaterThan(0);
    expect(cancelChatStream(partial)).toMatchObject({ phase: "cancelled", terminal: true, sections: [] });
  });
});
