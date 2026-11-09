import { ChatStreamProtocolError, parseChatStreamEnvelope, type ChatStreamEvent } from "@/lib/chat-stream-contract";

interface RawFrame { id: string; event: string; data: string }

export class ChatStreamParser {
  private readonly decoder = new TextDecoder();
  private buffer = "";
  private pendingCarriageReturn = false;

  push(chunk: Uint8Array, final = false): ChatStreamEvent[] {
    let text = this.decoder.decode(chunk, { stream: !final });

    // A CRLF can be split exactly between two network chunks. Do not turn the
    // trailing CR into a complete line until the next byte tells us whether it
    // is an LF; otherwise `\r` + `\n` becomes two line endings and tears the
    // current SSE frame in half.
    if (this.pendingCarriageReturn) {
      this.buffer += "\n";
      if (text.startsWith("\n")) text = text.slice(1);
      this.pendingCarriageReturn = false;
    }
    text = text.replaceAll("\r\n", "\n");
    if (!final && text.endsWith("\r")) {
      text = text.slice(0, -1);
      this.pendingCarriageReturn = true;
    }
    this.buffer += text.replaceAll("\r", "\n");
    if (final && this.pendingCarriageReturn) {
      this.buffer += "\n";
      this.pendingCarriageReturn = false;
    }

    const blocks = this.buffer.split("\n\n");
    this.buffer = final ? "" : blocks.pop() ?? "";
    if (final && blocks.at(-1) === "") blocks.pop();
    return blocks.flatMap((block) => {
      const frame = this.parseFrame(block);
      if (!frame) return [];
      let parsed: unknown;
      try { parsed = JSON.parse(frame.data); }
      catch { throw new ChatStreamProtocolError("Luồng trả lời chứa JSON không hợp lệ."); }
      return [parseChatStreamEnvelope(frame.event, frame.id, parsed)];
    });
  }

  finish(): ChatStreamEvent[] {
    return this.push(new Uint8Array(), true);
  }

  private parseFrame(block: string): RawFrame | null {
    let id = "";
    let event = "";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon < 0 ? line : line.slice(0, colon);
      let value = colon < 0 ? "" : line.slice(colon + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (field === "id") id = value;
      else if (field === "event") event = value;
      else if (field === "data") data.push(value);
    }
    if (!id && !event && data.length === 0) return null;
    if (!id || !event || data.length === 0) throw new ChatStreamProtocolError("SSE frame thiếu id, event hoặc data.");
    return { id, event, data: data.join("\n") };
  }
}

export async function readChatStreamV1(response: Response, onEvent: (event: ChatStreamEvent) => void): Promise<void> {
  if (!response.body) throw new ChatStreamProtocolError("Kết nối streaming không khả dụng.");
  const reader = response.body.getReader();
  const parser = new ChatStreamParser();
  while (true) {
    const { done, value } = await reader.read();
    for (const event of done ? parser.finish() : parser.push(value)) onEvent(event);
    if (done) break;
  }
}
