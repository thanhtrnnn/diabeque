export const CHAT_STREAM_EVENT_NAMES = [
  "stream.started",
  "agent.step",
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
/** Mirrors the return values of `backend/app/main.py::answer_state`. */
export const ANSWER_STATES = ["answered", "needs_info", "emergency", "insufficient_evidence", "out_of_scope"] as const;
export type AnswerState = typeof ANSWER_STATES[number];
export type SourceRole = "supporting" | "context";
/** Kinds the backend puts in `Section.kind`, plus `basis` which `main.py` appends after the agents' sections. */
export const SECTION_KINDS = ["conclusion", "basis", "notice", "risk", "advice", "question", "emergency"] as const;
export type SectionKind = typeof SECTION_KINDS[number];
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
  /** `"{kind}-{order}"`, for example `"risk-1"`. */
  id: string;
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

export interface AgentToolCall {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
}

/** One agent's turn, as `agent.step` streams it and as `answer.agent.trace` replays it. */
export interface AgentStep {
  agent: string;
  label: string;
  summary: string;
  tools: AgentToolCall[];
  ms: number;
}

export interface AgentProfileField {
  name: string;
  label: string;
  value: number;
  display: string;
}

export interface AgentRisk {
  task: "status3" | "diabtype";
  label: number;
  label_name: string;
  /** Calibrated and class-weighted: the screening view. */
  probs: Record<string, number>;
  /** Class frequencies restored: what to show people. Null when the survey database is absent. */
  probs_population: Record<string, number> | null;
  topic: string;
  model: string;
  defaulted: string[];
}

export interface AgentInfo {
  intent: string | null;
  trace: AgentStep[];
  profile: AgentProfileField[];
  /** Field names (BRFSS) the intake agent still needs. */
  missing: string[];
  risk: AgentRisk | null;
  safety_flags: string[];
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
  agent: AgentInfo;
}

export interface ChatRequest {
  message: string;
  /** The same id for every turn: the backend keeps the collected profile per conversation. */
  conversation_id: string;
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
const answerStates = new Set<string>(ANSWER_STATES);
const sourceRoles = new Set<string>(["supporting", "context"]);
const branches = new Set<string>(["bm25", "vector", "graph"]);
const sectionKinds = new Set<string>(SECTION_KINDS);
const SECTION_ID = /^([a-z]+)-(\d+)$/;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function textOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function stringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function isAnswerState(value: unknown): value is AnswerState {
  return typeof value === "string" && answerStates.has(value);
}

/** A section id is `"{kind}-{order}"`; when `kind` is given the prefix must be that kind. */
export function isSectionId(id: unknown, kind?: unknown): id is string {
  if (typeof id !== "string") return false;
  const match = SECTION_ID.exec(id);
  return match !== null && sectionKinds.has(match[1]) && (kind === undefined || match[1] === kind);
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
    if (!record(item) || !content || !sectionKinds.has(item.kind as string) || !isSectionId(item.id, item.kind) || !text(item.title) || sections.some((s) => s.id === item.id)) return null;
    sections.push({ id: item.id as string, kind: item.kind as SectionKind, title: item.title, content });
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

function parseToolCall(value: unknown): AgentToolCall | null {
  if (!record(value) || !text(value.name) || !record(value.args) || !("result" in value)) return null;
  return { name: value.name, args: value.args, result: value.result };
}

export function parseAgentStep(value: unknown): AgentStep | null {
  if (!record(value) || !text(value.agent) || !text(value.label) || typeof value.summary !== "string" || !Array.isArray(value.tools)) return null;
  if (typeof value.ms !== "number" || !Number.isFinite(value.ms) || value.ms < 0) return null;
  const tools = value.tools.map(parseToolCall);
  if (tools.some((tool) => tool === null)) return null;
  return { agent: value.agent, label: value.label, summary: value.summary, tools: tools as AgentToolCall[], ms: value.ms };
}

function parseProbs(value: unknown): Record<string, number> | null {
  if (!record(value)) return null;
  return Object.values(value).every((p) => typeof p === "number" && p >= 0 && p <= 1) ? value as Record<string, number> : null;
}

/** `undefined` means malformed; `null` is a valid "no risk estimate yet". */
function parseRisk(value: unknown): AgentRisk | null | undefined {
  if (value === null) return null;
  if (!record(value)) return undefined;
  const probs = parseProbs(value.probs);
  const population = value.probs_population === null ? null : parseProbs(value.probs_population);
  if (
    (value.task !== "status3" && value.task !== "diabtype") || !Number.isSafeInteger(value.label) || !text(value.label_name) ||
    !probs || (population === null && value.probs_population !== null) || typeof value.topic !== "string" || !text(value.model) || !stringList(value.defaulted)
  ) return undefined;
  return {
    task: value.task, label: value.label as number, label_name: value.label_name, probs, probs_population: population,
    topic: value.topic, model: value.model, defaulted: value.defaulted,
  };
}

function parseProfile(value: unknown): AgentProfileField[] | null {
  if (!Array.isArray(value)) return null;
  return value.every((item) => record(item) && text(item.name) && text(item.label) && typeof item.value === "number" && typeof item.display === "string")
    ? value as AgentProfileField[]
    : null;
}

export function parseAgentInfo(value: unknown): AgentInfo | null {
  if (!record(value) || !textOrNull(value.intent) || !Array.isArray(value.trace)) return null;
  const trace = value.trace.map(parseAgentStep);
  const profile = parseProfile(value.profile);
  const risk = parseRisk(value.risk);
  if (trace.some((step) => step === null) || !profile || !stringList(value.missing) || risk === undefined || !stringList(value.safety_flags)) return null;
  return { intent: value.intent, trace: trace as AgentStep[], profile, missing: value.missing, risk, safety_flags: value.safety_flags };
}

export function parseChatStreamAnswer(value: unknown): ChatStreamAnswer | null {
  if (!record(value)) return null;
  const sections = parseSections(value.sections);
  const citations = parseCitations(value.citations);
  const sources = parseSources(value.sources);
  const warnings = parseWarnings(value.warnings);
  const agent = parseAgentInfo(value.agent);
  const evidence = value.evidence_state;
  if (
    !text(value.id) || !text(value.conversation_id) || typeof value.answer !== "string" || !isAnswerState(value.state) ||
    typeof value.confidence !== "number" || value.confidence < 0 || value.confidence > 1 ||
    (evidence !== "sufficient" && evidence !== "insufficient") || !text(value.disclaimer) || !textOrNull(value.topic) ||
    typeof value.latency_ms !== "number" || !text(value.created_at) || !sections || !citations || !sources || !warnings || !agent
  ) return null;
  const cited = sections.flatMap((section) => section.content.filter((token) => token.type === "citation"));
  const known = new Set(citations.map((citation) => citation.id));
  const resolvable = new Set(sources.flatMap((source) => (source.citation_id ? [source.citation_id] : [])));
  if (cited.some((token) => !known.has(token.citation_id) || !resolvable.has(token.citation_id))) return null;
  // Only a cited answer is "sufficient"; a risk estimate or a greeting is `answered` with no citation at all.
  if (sources.some((source) => source.role === "supporting" && source.citation_id === null)) return null;
  if (cited.length > 0) {
    if (value.state !== "answered" || evidence !== "sufficient" || !sections.some((s) => s.kind === "conclusion" || s.kind === "advice")) return null;
  } else if (evidence !== "insufficient" || citations.length > 0 || sources.some((source) => source.role === "supporting")) return null;
  return {
    id: value.id, conversation_id: value.conversation_id, answer: value.answer, sections, state: value.state,
    confidence: value.confidence, evidence_state: evidence, citations, sources, warnings, disclaimer: value.disclaimer,
    topic: value.topic, latency_ms: value.latency_ms, created_at: value.created_at, agent,
  };
}

function validateEventData(event: ChatStreamEventName, data: Record<string, unknown>): boolean {
  switch (event) {
    case "stream.started": return true;
    case "agent.step": return parseAgentStep(data) !== null && (data.node === undefined || text(data.node));
    case "sources.snapshot": return Number.isSafeInteger(data.revision) && Number(data.revision) > 0 && parseSources(data.sources) !== null;
    case "answer.started": return isAnswerState(data.state) && Array.isArray(data.section_order) && data.section_order.every((kind) => sectionKinds.has(kind));
    case "answer.section.started": return isSectionId(data.section_id, data.kind) && text(data.title) && Number.isSafeInteger(data.order) && data.section_id === `${data.kind as string}-${data.order as number}`;
    case "answer.text.delta": return isSectionId(data.section_id) && typeof data.text_delta === "string";
    case "answer.citation": return isSectionId(data.section_id) && text(data.citation_id) && Number.isSafeInteger(data.label) && Number(data.label) > 0;
    case "answer.section.completed": return isSectionId(data.section_id);
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
