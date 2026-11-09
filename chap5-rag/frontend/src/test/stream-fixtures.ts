import type { SourceRecord } from "../lib/chat-stream-contract";

export const REQUEST_ID = "7a1c2b9e-0000-4000-8000-000000000001";
export const ANSWER_ID = "7a1c2b9e-0000-4000-8000-000000000002";
export const CONVERSATION_ID = "7a1c2b9e-0000-4000-8000-000000000003";
export const CITATION_ID = "7a1c2b9e-0000-4000-8000-000000000004";

export const DISCLAIMER_TEXT =
  "Thông tin chỉ để tham khảo, tổng hợp từ nguồn y tế công khai. Không thay thế chẩn đoán hay chỉ định điều trị của bác sĩ.";

export type StreamEvent = [name: string, data: Record<string, unknown>];

export function source(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    source_id: "chunk-niddk-1",
    citation_id: null,
    chunk_id: "chunk-niddk-1",
    document_id: "doc-niddk-prediabetes",
    document_title: "Eating well with prediabetes",
    publisher: "NIDDK",
    lang: "en",
    excerpt: "Choose whole grains, vegetables and lean protein. Limit sugary drinks.",
    source_url: "https://www.niddk.nih.gov/health-information/diabetes/overview/diet-eating-physical-activity",
    retrieval_rank: 1,
    normalized_score: 0.82,
    retrieved_by: ["bm25", "vector"],
    role: "context",
    ...overrides,
  };
}

export function frames(events: StreamEvent[], { conversationId = CONVERSATION_ID } = {}): string {
  return events
    .map(([name, data], index) => {
      const envelope = {
        v: 1,
        seq: index + 1,
        request_id: REQUEST_ID,
        conversation_id: conversationId,
        answer_id: ANSWER_ID,
        timestamp: "2026-10-26T08:00:00.000000+00:00",
        data,
      };
      return `id: ${index + 1}\nevent: ${name}\ndata: ${JSON.stringify(envelope)}\n\n`;
    })
    .join("");
}

const citedSource = source({ citation_id: CITATION_ID, role: "supporting" });
const otherSource = source({
  source_id: "chunk-vinmec-2", chunk_id: "chunk-vinmec-2", document_id: "doc-vinmec", document_title: "Chế độ ăn cho người tiền đái tháo đường",
  publisher: "Vinmec", lang: "vi", excerpt: "Ưu tiên rau xanh, ngũ cốc nguyên hạt.", source_url: "https://www.vinmec.com/vie/bai-viet/tien-dai-thao-duong",
  retrieval_rank: 2, normalized_score: 0.7, retrieved_by: ["vector", "graph"], role: "context",
});

function finalAnswer(state: string, sections: unknown[], sources: SourceRecord[], citations: unknown[], answer: string) {
  return {
    id: ANSWER_ID, conversation_id: CONVERSATION_ID, answer, sections, state, confidence: 0.82,
    evidence_state: state === "answered" ? "sufficient" : "insufficient", citations, sources, warnings: [],
    disclaimer: DISCLAIMER_TEXT, topic: "prediabetes", latency_ms: 1200, created_at: "2026-10-26T08:00:03.000000+00:00",
  };
}

export function answeredEvents(): StreamEvent[] {
  const sources = [citedSource, otherSource];
  const conclusion = [
    { type: "text", text: "Nên ưu tiên ngũ cốc nguyên hạt và rau, hạn chế đồ uống có đường " },
    { type: "citation", citation_id: CITATION_ID, label: 1 },
    { type: "text", text: "." },
  ];
  const basis = [
    { type: "text", text: "- Eating well with prediabetes (NIDDK) " },
    { type: "citation", citation_id: CITATION_ID, label: 1 },
  ];
  return [
    ["stream.started", { capabilities: ["inline_citations", "source_collection"] }],
    ["sources.snapshot", { revision: 1, sources: sources.map((s) => ({ ...s, citation_id: null, role: "context" })) }],
    ["answer.started", { state: "answered", section_order: ["conclusion", "basis"] }],
    ["answer.section.started", { section_id: "conclusion", kind: "conclusion", title: "Trả lời", order: 1 }],
    ["answer.text.delta", { section_id: "conclusion", text_delta: "Nên ưu tiên ngũ cốc nguyên hạt " }],
    ["answer.text.delta", { section_id: "conclusion", text_delta: "và rau, hạn chế đồ uống có đường " }],
    ["answer.citation", { section_id: "conclusion", citation_id: CITATION_ID, label: 1 }],
    ["answer.text.delta", { section_id: "conclusion", text_delta: "." }],
    ["answer.section.completed", { section_id: "conclusion" }],
    ["answer.section.started", { section_id: "basis", kind: "basis", title: "Căn cứ", order: 2 }],
    ["answer.text.delta", { section_id: "basis", text_delta: "- Eating well with prediabetes (NIDDK) " }],
    ["answer.citation", { section_id: "basis", citation_id: CITATION_ID, label: 1 }],
    ["answer.section.completed", { section_id: "basis" }],
    ["answer.final", {
      answer: finalAnswer("answered", [
        { id: "conclusion", kind: "conclusion", title: "Trả lời", content: conclusion },
        { id: "basis", kind: "basis", title: "Căn cứ", content: basis },
      ], sources, [{
        id: CITATION_ID, document_id: citedSource.document_id, chunk_id: citedSource.chunk_id, label: citedSource.document_title,
        publisher: citedSource.publisher, lang: citedSource.lang, excerpt: citedSource.excerpt, source_url: citedSource.source_url,
      }], "Nên ưu tiên ngũ cốc nguyên hạt và rau, hạn chế đồ uống có đường [1]."),
    }],
    ["stream.completed", { finish_reason: "stop" }],
  ];
}

export function refusalEvents(state: "out_of_scope" | "insufficient_evidence", retrieved: SourceRecord[] = state === "out_of_scope" ? [] : [otherSource]): StreamEvent[] {
  const message = state === "out_of_scope"
    ? "Câu hỏi nằm ngoài phạm vi tra cứu về đái tháo đường của hệ thống."
    : "Chưa tìm thấy bằng chứng trong kho tài liệu để trả lời câu hỏi này.";
  const content = [{ type: "text", text: message }];
  return [
    ["stream.started", { capabilities: [] }],
    ["sources.snapshot", { revision: 1, sources: retrieved }],
    ["answer.started", { state, section_order: ["notice"] }],
    ["answer.section.started", { section_id: "notice", kind: "notice", title: "Thông báo", order: 1 }],
    ["answer.text.delta", { section_id: "notice", text_delta: message }],
    ["answer.section.completed", { section_id: "notice" }],
    ["answer.final", {
      answer: finalAnswer(state, [{ id: "notice", kind: "notice", title: "Thông báo", content }], retrieved, [], message),
    }],
    ["stream.completed", { finish_reason: "stop" }],
  ];
}

export function errorEvents(retryable = true): StreamEvent[] {
  return [
    ["stream.started", { capabilities: [] }],
    ["stream.error", { error: { code: "INTERNAL", message: "Lỗi xử lý, vui lòng thử lại.", request_id: REQUEST_ID, retryable }, stage: "generation" }],
  ];
}

export const sse = (events: StreamEvent[]) =>
  new Response(frames(events), { headers: { "Content-Type": "text/event-stream", "X-Chat-Stream-Version": "1" } });
