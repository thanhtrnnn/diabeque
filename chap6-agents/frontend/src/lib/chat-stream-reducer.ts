import {
  ChatStreamProtocolError,
  parseAgentStep,
  parseChatStreamAnswer,
  type AgentStep,
  type AnswerSection,
  type AnswerState,
  type AnswerToken,
  type ChatStreamAnswer,
  type ChatStreamEvent,
  type SectionKind,
  type SourceRecord,
} from "@/lib/chat-stream-contract";

export interface DraftSection extends AnswerSection {
  order: number;
  completed: boolean;
}

export interface ChatStreamState {
  phase: "idle" | "researching" | "revealing" | "completed" | "technical_error" | "cancelled";
  lastSeq: number;
  requestId: string | null;
  answerState: AnswerState | null;
  sectionOrder: SectionKind[];
  /** Agents that have finished so far this turn, in the order they ran. */
  steps: AgentStep[];
  terminal: boolean;
  sourceRevision: number;
  sources: SourceRecord[];
  sections: DraftSection[];
  finalAnswer: ChatStreamAnswer | null;
  error: string | null;
  /** Transport failures are worth another try; a verdict from `stream.error` says so itself. */
  errorRetryable: boolean;
}

export const initialChatStreamState: ChatStreamState = {
  phase: "idle", lastSeq: 0, requestId: null, answerState: null, sectionOrder: [], steps: [], terminal: false,
  sourceRevision: 0, sources: [], sections: [], finalAnswer: null, error: null, errorRetryable: true,
};

function fail(message: string): never { throw new ChatStreamProtocolError(message); }

function openSection(state: ChatStreamState, id: unknown): DraftSection {
  const section = state.sections.find((item) => item.id === id);
  if (!section || section.completed) fail("Answer event tham chiếu section chưa mở hoặc đã đóng.");
  return section;
}

function withSection(state: ChatStreamState, section: DraftSection, change: Partial<DraftSection>): ChatStreamState {
  return { ...state, sections: state.sections.map((item) => (item === section ? { ...item, ...change } : item)) };
}

export function reduceChatStream(state: ChatStreamState, event: ChatStreamEvent): ChatStreamState {
  const { envelope } = event;
  if (state.terminal) fail("Nhận event sau terminal event.");
  if (envelope.seq !== state.lastSeq + 1) fail("Sequence SSE không liên tục.");
  if (state.requestId && envelope.request_id !== state.requestId) fail("request_id thay đổi giữa stream.");
  if (state.lastSeq === 0 && event.event !== "stream.started") fail("stream.started phải là event đầu tiên.");
  const next: ChatStreamState = { ...state, lastSeq: envelope.seq, requestId: state.requestId ?? envelope.request_id };
  const payload = envelope.data;
  switch (event.event) {
    case "stream.started": return { ...next, phase: "researching" };
    case "agent.step": {
      const step = parseAgentStep(payload);
      if (next.answerState || !step) fail("agent.step đến sau answer.started hoặc không hợp lệ.");
      return { ...next, steps: [...next.steps, step] };
    }
    case "sources.snapshot":
      if (next.answerState) fail("sources.snapshot đến sau answer.started.");
      if (payload.revision !== next.sourceRevision + 1) fail("sources.snapshot revision không liên tục.");
      return { ...next, sourceRevision: payload.revision as number, sources: payload.sources as SourceRecord[] };
    case "answer.started":
      if (next.answerState || !envelope.answer_id || !envelope.conversation_id) fail("answer.started không hợp lệ.");
      return { ...next, answerState: payload.state as AnswerState, sectionOrder: payload.section_order as SectionKind[], phase: "revealing" };
    case "answer.section.started":
      if (!next.answerState || next.sections.some((item) => !item.completed) || next.sectionOrder[next.sections.length] !== payload.kind || Number(payload.order) !== next.sections.length + 1) fail("Không thể mở answer section.");
      return { ...next, sections: [...next.sections, { id: payload.section_id as string, kind: payload.kind as SectionKind, title: payload.title as string, order: payload.order as number, content: [], completed: false }] };
    case "answer.text.delta": {
      const section = openSection(next, payload.section_id);
      const delta = payload.text_delta as string;
      const last = section.content.at(-1);
      const content: AnswerToken[] = last?.type === "text"
        ? [...section.content.slice(0, -1), { type: "text", text: last.text + delta }]
        : [...section.content, { type: "text", text: delta }];
      return withSection(next, section, { content });
    }
    case "answer.citation": {
      const section = openSection(next, payload.section_id);
      return withSection(next, section, { content: [...section.content, { type: "citation", citation_id: payload.citation_id as string, label: payload.label as number }] });
    }
    case "answer.section.completed": return withSection(next, openSection(next, payload.section_id), { completed: true });
    case "answer.final": {
      const answer = parseChatStreamAnswer(payload.answer);
      if (!next.answerState || next.sections.some((item) => !item.completed) || next.sections.length !== next.sectionOrder.length) fail("answer.final đến trước khi section hoàn tất.");
      if (!answer || answer.id !== envelope.answer_id || answer.conversation_id !== envelope.conversation_id) fail("answer.final không hợp lệ.");
      return {
        ...next, finalAnswer: answer, sources: answer.sources,
        steps: next.steps.length > 0 ? next.steps : answer.agent.trace,
        sections: answer.sections.map((item, index) => ({ ...item, order: index + 1, completed: true })),
      };
    }
    case "stream.completed":
      if (!next.finalAnswer) fail("stream.completed thiếu answer.final hợp lệ.");
      return { ...next, terminal: true, phase: "completed" };
    case "stream.error": {
      const error = payload.error as Record<string, unknown>;
      return { ...next, terminal: true, phase: "technical_error", sections: [], finalAnswer: null, error: error.message as string, errorRetryable: error.retryable === true };
    }
  }
}

export function failChatStream(state: ChatStreamState, message: string, retryable = true): ChatStreamState {
  return { ...state, phase: "technical_error", terminal: true, sections: [], finalAnswer: null, error: message, errorRetryable: retryable };
}

export function cancelChatStream(state: ChatStreamState): ChatStreamState {
  return { ...state, phase: "cancelled", terminal: true, sections: [], finalAnswer: null, error: null, errorRetryable: true };
}
