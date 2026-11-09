import { parseChatStreamAnswer, type ChatStreamAnswer } from "@/lib/chat-stream-contract";
import { rutGonTieuDe } from "@/lib/tieu-de-hoi-thoai";

export interface StoredTurn {
  question: string;
  answer: ChatStreamAnswer;
}

export interface StoredConversation {
  id: string;
  title: string;
  updatedAt: string;
  turns: StoredTurn[];
}

export const STORAGE_KEY = "dtd.agent.conversations.v1";
const MAX_CONVERSATIONS = 30;

function parseTurn(value: unknown): StoredTurn | null {
  if (typeof value !== "object" || value === null) return null;
  const turn = value as Record<string, unknown>;
  const answer = parseChatStreamAnswer(turn.answer);
  if (typeof turn.question !== "string" || !answer) return null;
  return { question: turn.question, answer };
}

function parseConversation(value: unknown): StoredConversation | null {
  if (typeof value !== "object" || value === null) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || typeof item.title !== "string" || typeof item.updatedAt !== "string" || !Array.isArray(item.turns)) return null;
  const turns = item.turns.map(parseTurn).filter((turn) => turn !== null);
  return turns.length > 0 ? { id: item.id, title: item.title, updatedAt: item.updatedAt, turns } : null;
}

export function loadConversations(storage: Pick<Storage, "getItem"> = window.localStorage): StoredConversation[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(parseConversation).filter((item) => item !== null) : [];
  } catch {
    return [];
  }
}

export function saveConversations(items: StoredConversation[], storage: Pick<Storage, "setItem"> = window.localStorage): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* private mode or quota: history is a convenience, the live session keeps working */
  }
}

export function appendTurn(items: StoredConversation[], conversationId: string, turn: StoredTurn): StoredConversation[] {
  const existing = items.find((item) => item.id === conversationId);
  const updated: StoredConversation = {
    id: conversationId,
    title: existing?.title ?? rutGonTieuDe(turn.question),
    updatedAt: turn.answer.created_at,
    turns: [...(existing?.turns ?? []), turn],
  };
  return [updated, ...items.filter((item) => item.id !== conversationId)].slice(0, MAX_CONVERSATIONS);
}

export function renameConversation(items: StoredConversation[], id: string, title: string): StoredConversation[] {
  return items.map((item) => (item.id === id ? { ...item, title } : item));
}

export function removeConversation(items: StoredConversation[], id: string): StoredConversation[] {
  return items.filter((item) => item.id !== id);
}
