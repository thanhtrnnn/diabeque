export const CHAT_STREAM_EVENT_NAMES = [
  "stream.started",
  "sources.snapshot",
  "answer.started",
  "answer.section.started",
  "answer.text.delta",
  "answer.citation",
  "answer.section.completed",
  "answer.final",
  "stream.completed",
  "stream.error",
] as const;

/** Mirrors `backend/app/schema.py::DISCLAIMER`. */
export const DISCLAIMER =
  "Thông tin chỉ để tham khảo, tổng hợp từ nguồn y tế công khai. Không thay thế chẩn đoán hay chỉ định điều trị của bác sĩ.";

export type ChatStreamEventName = typeof CHAT_STREAM_EVENT_NAMES[number];
export type AnswerState = "answered" | "insufficient_evidence" | "out_of_scope";
export type SourceRole = "supporting" | "context";
export type SectionKind = "conclusion" | "basis" | "notice";
export type EvidenceState = "sufficient" | "insufficient";
export type RetrievalBranch = "bm25" | "vector" | "graph";

export interface SourceRecord {
  source_id: string;
  citation_id: string | null;
  chunk_id: string;
  document_id: string;
  document_title: string;
  publisher: string;
  lang: string;
  excerpt: string;
  source_url: string | null;
  retrieval_rank: number;
  normalized_score: number;
  retrieved_by: RetrievalBranch[];
  role: SourceRole;
}

export type AnswerToken =
  | { type: "text"; text: string }
  | { type: "citation"; citation_id: string; label: number };

export interface AnswerSection {
  id: SectionKind;
  kind: SectionKind;
  title: string;
  content: AnswerToken[];
}

export interface AnswerCitation {
  id: string;
  document_id: string;
  chunk_id: string;
  /** Document title. */
  label: string;
  publisher: string;
  lang: string;
  excerpt: string;
  source_url: string | null;
}

export interface AnswerWarning {
  code: string;
  message: string;
}

export interface ChatStreamAnswer {
  id: string;
  conversation_id: string;
  /** Plain text of the conclusion, citations rendered as [n]. */
  answer: string;
  sections: AnswerSection[];
  state: AnswerState;
  confidence: number;
  evidence_state: EvidenceState;
  citations: AnswerCitation[];
  sources: SourceRecord[];
  warnings: AnswerWarning[];
  disclaimer: string;
  topic: string | null;
  latency_ms: number;
  created_at: string;
}

export interface ChatRequest {
  message: string;
  conversation_id: string;
  topic?: string;
}

export interface ChatStreamEnvelope {
  v: 1;
  seq: number;
  request_id: string;
  conversation_id: string | null;
  answer_id: string | null;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface ChatStreamEvent {
  id: string;
  event: ChatStreamEventName;
  envelope: ChatStreamEnvelope;
}

export class ChatStreamProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatStreamProtocolError";
  }
}

const eventNames = new Set<string>(CHAT_STREAM_EVENT_NAMES);
const answerStates = new Set<string>(["answered", "insufficient_evidence", "out_of_scope"]);
const sourceRoles = new Set<string>(["supporting", "context"]);
const branches = new Set<string>(["bm25", "vector", "graph"]);
const sectionKinds = new Set<string>(["conclusion", "basis", "notice"]);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function textOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function isAnswerState(value: unknown): value is AnswerState {
  return typeof value === "string" && answerStates.has(value);
}

export function parseSource(value: unknown): SourceRecord | null {
  if (!record(value)) return null;
  const rank = value.retrieval_rank;
  const score = value.normalized_score;
  if (
    !text(value.source_id) || !(value.citation_id === null || text(value.citation_id)) ||
    !text(value.chunk_id) || !text(value.document_id) || !text(value.document_title) ||
    !text(value.publisher) || !text(value.lang) || typeof value.excerpt !== "string" ||
    !textOrNull(value.source_url) || !Number.isSafeInteger(rank) || Number(rank) < 1 ||
    typeof score !== "number" || score < 0 || score > 1 ||
    !Array.isArray(value.retrieved_by) || !value.retrieved_by.every((item) => branches.has(item)) ||
    !sourceRoles.has(value.role as string)
  ) return null;
  return value as unknown as SourceRecord;
}

function parseSources(value: unknown): SourceRecord[] | null {
  if (!Array.isArray(value)) return null;
  const sources = value.map(parseSource);
  return sources.every((source) => source !== null) ? sources : null;
}

function parseContent(value: unknown): AnswerToken[] | null {
  if (!Array.isArray(value)) return null;
  const tokens: AnswerToken[] = [];
  for (const item of value) {
    if (!record(item)) return null;
    if (item.type === "text" && typeof item.text === "string") tokens.push({ type: "text", text: item.text });
    else if (item.type === "citation" && text(item.citation_id) && Number.isSafeInteger(item.label) && Number(item.label) > 0) {
      tokens.push({ type: "citation", citation_id: item.citation_id, label: item.label as number });
    } else return null;
  }
  return tokens;
}

function parseSections(value: unknown): AnswerSection[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const sections: AnswerSection[] = [];
  for (const item of value) {
    const content = record(item) ? parseContent(item.content) : null;
    if (!record(item) || !content || !sectionKinds.has(item.id as string) || item.kind !== item.id || !text(item.title) || sections.some((s) => s.id === item.id)) return null;
    sections.push({ id: item.id as SectionKind, kind: item.kind as SectionKind, title: item.title, content });
  }
  return sections;
}

function parseCitations(value: unknown): AnswerCitation[] | null {
  if (!Array.isArray(value)) return null;
  const citations: AnswerCitation[] = [];
  for (const item of value) {
    if (!record(item) || !text(item.id) || !text(item.document_id) || !text(item.chunk_id) || !text(item.label) || !text(item.publisher) || !text(item.lang) || typeof item.excerpt !== "string" || !textOrNull(item.source_url)) return null;
    citations.push(item as unknown as AnswerCitation);
  }
  return citations;
}

function parseWarnings(value: unknown): AnswerWarning[] | null {
  if (!Array.isArray(value)) return null;
  return value.every((item) => record(item) && text(item.code) && text(item.message)) ? value as AnswerWarning[] : null;
}

export function parseChatStreamAnswer(value: unknown): ChatStreamAnswer | null {
  if (!record(value)) return null;
  const sections = parseSections(value.sections);
  const citations = parseCitations(value.citations);
  const sources = parseSources(value.sources);
  const warnings = parseWarnings(value.warnings);
  const evidence = value.evidence_state;
  if (
    !text(value.id) || !text(value.conversation_id) || typeof value.answer !== "string" || !isAnswerState(value.state) ||
    typeof value.confidence !== "number" || value.confidence < 0 || value.confidence > 1 ||
    (evidence !== "sufficient" && evidence !== "insufficient") || !text(value.disclaimer) || !textOrNull(value.topic) ||
    typeof value.latency_ms !== "number" || !text(value.created_at) || !sections || !citations || !sources || !warnings
  ) return null;
  const cited = sections.flatMap((section) => section.content.filter((token) => token.type === "citation"));
  const known = new Set(citations.map((citation) => citation.id));
  const resolvable = new Set(sources.flatMap((source) => (source.citation_id ? [source.citation_id] : [])));
  if (cited.some((token) => !known.has(token.citation_id) || !resolvable.has(token.citation_id))) return null;
  if (value.state === "answered") {
    const supporting = sources.filter((source) => source.role === "supporting");
    if (evidence !== "sufficient" || cited.length === 0 || !sections.some((s) => s.kind === "conclusion") || supporting.some((s) => s.citation_id === null)) return null;
  } else if (evidence !== "insufficient" || cited.length > 0 || citations.length > 0 || sources.some((source) => source.role === "supporting")) return null;
  return {
    id: value.id, conversation_id: value.conversation_id, answer: value.answer, sections, state: value.state,
    confidence: value.confidence, evidence_state: evidence, citations, sources, warnings, disclaimer: value.disclaimer,
    topic: value.topic, latency_ms: value.latency_ms, created_at: value.created_at,
  };
}

function validateEventData(event: ChatStreamEventName, data: Record<string, unknown>): boolean {
  switch (event) {
    case "stream.started": return true;
    case "sources.snapshot": return Number.isSafeInteger(data.revision) && Number(data.revision) > 0 && parseSources(data.sources) !== null;
    case "answer.started": return isAnswerState(data.state) && Array.isArray(data.section_order) && data.section_order.every((kind) => sectionKinds.has(kind));
    case "answer.section.started": return sectionKinds.has(data.section_id as string) && data.kind === data.section_id && text(data.title) && Number.isSafeInteger(data.order);
    case "answer.text.delta": return sectionKinds.has(data.section_id as string) && typeof data.text_delta === "string";
    case "answer.citation": return sectionKinds.has(data.section_id as string) && text(data.citation_id) && Number.isSafeInteger(data.label) && Number(data.label) > 0;
    case "answer.section.completed": return sectionKinds.has(data.section_id as string);
    case "answer.final": return parseChatStreamAnswer(data.answer) !== null;
    case "stream.completed": return true;
    case "stream.error": return record(data.error) && text(data.error.code) && text(data.error.message) && typeof data.error.retryable === "boolean";
  }
}

export function parseChatStreamEnvelope(eventName: string, id: string, value: unknown): ChatStreamEvent {
  if (
    !eventNames.has(eventName) || !record(value) || value.v !== 1 || !Number.isSafeInteger(value.seq) ||
    Number(value.seq) < 1 || id !== String(value.seq) || !text(value.request_id) ||
    !textOrNull(value.conversation_id) || !textOrNull(value.answer_id) ||
    !text(value.timestamp) || Number.isNaN(Date.parse(value.timestamp)) || !record(value.data)
  ) throw new ChatStreamProtocolError("Luồng trả lời không đúng hợp đồng SSE.");
  const event = eventName as ChatStreamEventName;
  if (!validateEventData(event, value.data)) throw new ChatStreamProtocolError(`Dữ liệu ${event} không hợp lệ.`);
  return { id, event, envelope: value as unknown as ChatStreamEnvelope };
}
