import { describe, expect, it } from "vitest";

import { parseChatStreamAnswer } from "@/lib/chat-stream-contract";
import {
  STORAGE_KEY,
  appendTurn,
  loadConversations,
  removeConversation,
  renameConversation,
  saveConversations,
} from "@/lib/conversation-store";
import { answeredEvents } from "@/test/stream-fixtures";

const answer = parseChatStreamAnswer(answeredEvents().find(([name]) => name === "answer.final")?.[1].answer);
if (!answer) throw new Error("fixture answer must parse");
const turn = (question: string) => ({ question, answer });

function memory(initial?: string) {
  const data = new Map<string, string>(initial ? [[STORAGE_KEY, initial]] : []);
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
}

describe("conversation store", () => {
  it("appends turns to one conversation, newest conversation first, with a shortened title", () => {
    let items = appendTurn([], "a", turn("Cho tôi hỏi triệu chứng đái tháo đường type 2?"));
    items = appendTurn(items, "b", turn("Tiền đái tháo đường ăn gì?"));
    items = appendTurn(items, "a", turn("Còn biến chứng?"));
    expect(items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(items[0].title).toBe("triệu chứng đái tháo đường type 2");
    expect(items[0].turns.map((t) => t.question)).toEqual(["Cho tôi hỏi triệu chứng đái tháo đường type 2?", "Còn biến chứng?"]);
  });

  it("round-trips through storage and drops entries whose answer no longer satisfies the contract", () => {
    const storage = memory();
    saveConversations(appendTurn([], "a", turn("Câu hỏi?")), storage);
    const raw = JSON.parse(storage.getItem(STORAGE_KEY) as string);
    raw.push({ id: "bad", title: "x", updatedAt: "2026-10-26T00:00:00Z", turns: [{ question: "q", answer: { state: "answered" } }] });
    expect(loadConversations(memory(JSON.stringify(raw))).map((item) => item.id)).toEqual(["a"]);
  });

  it("treats unreadable or corrupt storage as empty and never throws on write", () => {
    expect(loadConversations(memory("{not json"))).toEqual([]);
    expect(loadConversations({ getItem: () => { throw new Error("blocked"); } })).toEqual([]);
    expect(() => saveConversations([], { setItem: () => { throw new Error("quota"); } })).not.toThrow();
  });

  it("renames and removes", () => {
    const items = appendTurn([], "a", turn("Câu hỏi?"));
    expect(renameConversation(items, "a", "Tên mới")[0].title).toBe("Tên mới");
    expect(removeConversation(items, "a")).toEqual([]);
  });

  it("keeps at most 30 conversations", () => {
    let items = appendTurn([], "0", turn("Câu hỏi?"));
    for (let i = 1; i < 40; i += 1) items = appendTurn(items, String(i), turn("Câu hỏi?"));
    expect(items).toHaveLength(30);
    expect(items[0].id).toBe("39");
  });
});
