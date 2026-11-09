import { describe, expect, it } from "vitest";

import { ChatStreamParser } from "@/lib/chat-stream-parser";
import { answeredEvents, emergencyEvents, errorEvents, frames, needsInfoEvents, refusalEvents, riskEvents } from "@/test/stream-fixtures";

const encode = (text: string) => new TextEncoder().encode(text);
const answered = frames(answeredEvents());

describe("ChatStreamParser", () => {
  it.each([
    ["answered", answeredEvents(), "stream.completed"],
    ["out_of_scope", refusalEvents("out_of_scope"), "stream.completed"],
    ["insufficient_evidence", refusalEvents("insufficient_evidence"), "stream.completed"],
    ["needs_info", needsInfoEvents(), "stream.completed"],
    ["risk", riskEvents(), "stream.completed"],
    ["emergency", emergencyEvents(), "stream.completed"],
    ["error", errorEvents(), "stream.error"],
  ])("parses a complete %s stream", (_name, events, last) => {
    const parser = new ChatStreamParser();
    const parsed = [...parser.push(encode(frames(events))), ...parser.finish()];
    expect(parsed[0].event).toBe("stream.started");
    expect(parsed.at(-1)?.event).toBe(last);
    expect(parsed.map((event) => event.envelope.seq)).toEqual(parsed.map((_, index) => index + 1));
  });

  it("handles a UTF-8 character split across chunks, CRLF, comments and a final frame without newline", () => {
    const raw = answered.replaceAll("\n", "\r\n").replace("id: 1\r\n", ": keepalive\r\nid: 1\r\n").trimEnd();
    const bytes = encode(raw);
    const marker = encode("Đ");
    const splitAt = bytes.findIndex((value, index) => value === marker[0] && bytes[index + 1] === marker[1]) + 1;
    const parser = new ChatStreamParser();
    const events = [
      ...parser.push(bytes.slice(0, splitAt)),
      ...parser.push(bytes.slice(splitAt, splitAt + 117)),
      ...parser.push(bytes.slice(splitAt + 117)),
      ...parser.finish(),
    ];
    expect(events).toHaveLength(answeredEvents().length);
    expect(events.at(-1)?.event).toBe("stream.completed");
  });

  it("keeps a CRLF split across two transport chunks as one line ending", () => {
    const raw = answered.replaceAll("\n", "\r\n");
    const splitAt = encode(raw.slice(0, raw.indexOf("\r\n") + 1)).byteLength;
    const bytes = encode(raw);
    const parser = new ChatStreamParser();
    const events = [...parser.push(bytes.slice(0, splitAt)), ...parser.push(bytes.slice(splitAt)), ...parser.finish()];
    expect(events).toHaveLength(answeredEvents().length);
  });

  it("supports multiline data fields", () => {
    const multiline = frames(errorEvents()).replace('data: {"v":1,', 'data: {\ndata: "v":1,');
    const parser = new ChatStreamParser();
    const events = [...parser.push(encode(multiline)), ...parser.finish()];
    expect(events[0].event).toBe("stream.started");
  });
});
