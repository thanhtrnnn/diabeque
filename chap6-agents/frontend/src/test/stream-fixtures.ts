import type { AgentInfo, AgentStep, SourceRecord } from "../lib/chat-stream-contract";

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

export const step = (agent: string, label: string, summary: string, ms: number, tools: AgentStep["tools"] = []): AgentStep => ({ agent, label, summary, tools, ms });

const SAFETY_IN = step("safety_in", "An toàn (vào)", "Không có dấu hiệu khẩn cấp", 0);
const ORCHESTRATOR = (intent: string) => step("orchestrator", "Điều phối", `Ý định: ${intent} (LLM: phân loại theo nội dung tin nhắn)`, 640);
const SAFETY_OUT = (summary = "Đã kiểm 1 phần do LLM viết") => step("safety_out", "An toàn (ra)", summary, 0);

export function agentInfo(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return { intent: "knowledge", trace: [], profile: [], missing: [], risk: null, safety_flags: [], ...overrides };
}

type Warning = { code: string; message: string };

function finalAnswer(
  state: string, sections: unknown[], sources: SourceRecord[], citations: unknown[], answer: string,
  agent: AgentInfo, warnings: Warning[] = [], evidence = state === "answered" && citations.length > 0 ? "sufficient" : "insufficient",
) {
  return {
    id: ANSWER_ID, conversation_id: CONVERSATION_ID, answer, sections, state, confidence: 0, evidence_state: evidence,
    citations, sources, warnings, disclaimer: DISCLAIMER_TEXT, topic: agent.risk?.topic ?? null, latency_ms: 1200,
    created_at: "2026-10-26T08:00:03.000000+00:00", agent,
  };
}

const stepEvents = (steps: AgentStep[]): StreamEvent[] => steps.map((s) => ["agent.step", { node: s.agent, ...s }]);

const citationRecord = {
  id: CITATION_ID, document_id: citedSource.document_id, chunk_id: citedSource.chunk_id, label: citedSource.document_title,
  publisher: citedSource.publisher, lang: citedSource.lang, excerpt: citedSource.excerpt, source_url: citedSource.source_url,
};

/** A knowledge question: safety, orchestrator, knowledge agent, safety again; conclusion with one citation plus its basis. */
export function answeredEvents(): StreamEvent[] {
  const sources = [citedSource, otherSource];
  const trace = [
    SAFETY_IN, ORCHESTRATOR("knowledge"),
    step("knowledge", "Tra cứu tri thức", "RAG: answered, 1 trích dẫn", 5400, [
      { name: "search_knowledge", args: { question: "Người bị tiền đái tháo đường nên ăn gì?", topic: null }, result: { state: "answered", top_score: 0.88, used: ["S1"], hits: ["chunk-niddk-1", "chunk-vinmec-2"] } },
    ]),
    SAFETY_OUT(),
  ];
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
    ["stream.started", { capabilities: ["inline_citations", "source_collection", "agent_trace"] }],
    ...stepEvents(trace),
    ["sources.snapshot", { revision: 1, sources: sources.map((s) => ({ ...s, citation_id: null, role: "context" })) }],
    ["answer.started", { state: "answered", section_order: ["conclusion", "basis"] }],
    ["answer.section.started", { section_id: "conclusion-1", kind: "conclusion", title: "Trả lời", order: 1 }],
    ["answer.text.delta", { section_id: "conclusion-1", text_delta: "Nên ưu tiên ngũ cốc nguyên hạt " }],
    ["answer.text.delta", { section_id: "conclusion-1", text_delta: "và rau, hạn chế đồ uống có đường " }],
    ["answer.citation", { section_id: "conclusion-1", citation_id: CITATION_ID, label: 1 }],
    ["answer.text.delta", { section_id: "conclusion-1", text_delta: "." }],
    ["answer.section.completed", { section_id: "conclusion-1" }],
    ["answer.section.started", { section_id: "basis-2", kind: "basis", title: "Căn cứ", order: 2 }],
    ["answer.text.delta", { section_id: "basis-2", text_delta: "- Eating well with prediabetes (NIDDK) " }],
    ["answer.citation", { section_id: "basis-2", citation_id: CITATION_ID, label: 1 }],
    ["answer.section.completed", { section_id: "basis-2" }],
    ["answer.final", {
      answer: finalAnswer("answered", [
        { id: "conclusion-1", kind: "conclusion", title: "Trả lời", content: conclusion },
        { id: "basis-2", kind: "basis", title: "Căn cứ", content: basis },
      ], sources, [citationRecord], "Nên ưu tiên ngũ cốc nguyên hạt và rau, hạn chế đồ uống có đường [1].", agentInfo({ trace })),
    }],
    ["stream.completed", { finish_reason: "stop" }],
  ];
}

export function refusalEvents(state: "out_of_scope" | "insufficient_evidence", retrieved: SourceRecord[] = state === "out_of_scope" ? [] : [otherSource]): StreamEvent[] {
  const message = state === "out_of_scope"
    ? "Câu hỏi nằm ngoài phạm vi của trợ lý. Tôi chỉ hỗ trợ thông tin và sàng lọc nguy cơ đái tháo đường."
    : "Chưa tìm thấy bằng chứng trong kho tài liệu để trả lời câu hỏi này.";
  const title = state === "out_of_scope" ? "Ngoài phạm vi" : "Chưa đủ bằng chứng";
  const content = [{ type: "text", text: message }];
  const trace = [SAFETY_IN, ORCHESTRATOR(state === "out_of_scope" ? "out_of_scope" : "knowledge"), SAFETY_OUT("Đã kiểm 0 phần do LLM viết")];
  return [
    ["stream.started", { capabilities: [] }],
    ...stepEvents(trace),
    ["sources.snapshot", { revision: 1, sources: retrieved }],
    ["answer.started", { state, section_order: ["notice"] }],
    ["answer.section.started", { section_id: "notice-1", kind: "notice", title, order: 1 }],
    ["answer.text.delta", { section_id: "notice-1", text_delta: message }],
    ["answer.section.completed", { section_id: "notice-1" }],
    ["answer.final", {
      answer: finalAnswer(state, [{ id: "notice-1", kind: "notice", title, content }], retrieved, [], message, agentInfo({ intent: state === "out_of_scope" ? "out_of_scope" : "knowledge", trace })),
    }],
    ["stream.completed", { finish_reason: "stop" }],
  ];
}

export const QUESTION_TEXT = "Để ước lượng nguy cơ, tôi cần thêm vài thông tin:\n- Anh/chị đã từng được nói là có cholesterol (mỡ máu) cao chưa?\n- Trong 30 ngày qua, anh/chị có tập thể dục hoặc vận động thể chất không?";

/** First risk turn: the intake agent keeps what it understood and asks for the rest. */
export function needsInfoEvents(): StreamEvent[] {
  const trace = [
    SAFETY_IN, ORCHESTRATOR("assess_risk"),
    step("intake", "Thu thập thông tin", "Ghi nhận 4 trường; còn thiếu HighChol, PhysActivity, GenHlth", 520, [
      { name: "compute_bmi", args: { height_m: 165, weight_kg: 80 }, result: { bmi: 29.4 } },
      { name: "validate_profile", args: { profile: { Age: 7, Sex: 1, BMI: 29.4, HighBP: 1 } }, result: { profile: { Age: 7, Sex: 1, BMI: 29.4, HighBP: 1 }, rejected: [] } },
    ]),
    SAFETY_OUT("Đã kiểm 0 phần do LLM viết"),
  ];
  const agent = agentInfo({
    intent: "assess_risk", trace,
    profile: [
      { name: "Age", label: "Nhóm tuổi", value: 7, display: "50-54" },
      { name: "Sex", label: "Giới tính", value: 1, display: "Nam" },
      { name: "BMI", label: "Chỉ số khối cơ thể (BMI)", value: 29.4, display: "29.4" },
      { name: "HighBP", label: "Huyết áp cao", value: 1, display: "có" },
    ],
    missing: ["HighChol", "PhysActivity", "GenHlth"],
  });
  return [
    ["stream.started", { capabilities: ["agent_trace"] }],
    ...stepEvents(trace),
    ["sources.snapshot", { revision: 1, sources: [] }],
    ["answer.started", { state: "needs_info", section_order: ["question"] }],
    ["answer.section.started", { section_id: "question-1", kind: "question", title: "Cần thêm thông tin", order: 1 }],
    ["answer.text.delta", { section_id: "question-1", text_delta: QUESTION_TEXT }],
    ["answer.section.completed", { section_id: "question-1" }],
    ["answer.final", {
      answer: finalAnswer("needs_info", [{ id: "question-1", kind: "question", title: "Cần thêm thông tin", content: [{ type: "text", text: QUESTION_TEXT }] }], [], [], QUESTION_TEXT, agent),
    }],
    ["stream.completed", { finish_reason: "stop" }],
  ];
}

export const RISK_TEXT = "Trong dữ liệu khảo sát BRFSS, mô hình **MLP** ước lượng tỷ lệ ở những người có hồ sơ tương tự:\n- không báo cáo mắc bệnh: **84%**\n- đã được thông báo tiền đái tháo đường: **3%**\n- đã được thông báo mắc đái tháo đường: **13%**";

/** Second risk turn: profile complete, risk estimate plus a cited piece of advice. */
export function riskEvents(): StreamEvent[] {
  const sources = [citedSource, otherSource];
  const risk: NonNullable<AgentInfo["risk"]> = {
    task: "status3", label: 2, label_name: "Báo cáo mắc đái tháo đường", topic: "diabetes_general", model: "mlp",
    probs: { "0": 0.45, "1": 0.2, "2": 0.35 }, probs_population: { "0": 0.84, "1": 0.03, "2": 0.13 }, defaulted: ["Smoker", "Stroke"],
  };
  const trace = [
    SAFETY_IN, ORCHESTRATOR("assess_risk"),
    step("intake", "Thu thập thông tin", "Hồ sơ đủ 7 trường bắt buộc (7 trường đã có)", 480),
    step("risk", "Dự đoán nguy cơ", "predict_diabetes_risk → Báo cáo mắc đái tháo đường (mlp)", 40, [{ name: "predict_diabetes_risk", args: { features: { Age: 7 } }, result: risk }]),
    step("advisor", "Tư vấn", "Lời khuyên với 1 trích dẫn", 7800, [{ name: "get_recommendations", args: { query: "giảm cân", topic: "diabetes_general" }, result: { hits: ["chunk-niddk-1"], top_score: 0.83 } }]),
    SAFETY_OUT("Đã kiểm 1 phần do LLM viết; cờ: dosage_removed"),
  ];
  const advice = [
    { type: "text", text: "- Ưu tiên ngũ cốc nguyên hạt và rau " },
    { type: "citation", citation_id: CITATION_ID, label: 1 },
  ];
  const basis = [{ type: "text", text: "- Eating well with prediabetes (NIDDK) " }, { type: "citation", citation_id: CITATION_ID, label: 1 }];
  const agent = agentInfo({
    intent: "assess_risk", trace, risk, safety_flags: ["dosage_removed"],
    profile: [{ name: "Age", label: "Nhóm tuổi", value: 7, display: "50-54" }, { name: "HighChol", label: "Mỡ máu cao", value: 0, display: "không" }],
  });
  const warnings = [{ code: "dosage_removed", message: "Đã bỏ câu có liều thuốc." }];
  return [
    ["stream.started", { capabilities: ["agent_trace"] }],
    ...stepEvents(trace),
    ["sources.snapshot", { revision: 1, sources: sources.map((s) => ({ ...s, citation_id: null, role: "context" })) }],
    ["answer.started", { state: "answered", section_order: ["risk", "advice", "basis"] }],
    ["answer.section.started", { section_id: "risk-1", kind: "risk", title: "Ước lượng nguy cơ", order: 1 }],
    ["answer.text.delta", { section_id: "risk-1", text_delta: RISK_TEXT }],
    ["answer.section.completed", { section_id: "risk-1" }],
    ["answer.section.started", { section_id: "advice-2", kind: "advice", title: "Lời khuyên", order: 2 }],
    ["answer.text.delta", { section_id: "advice-2", text_delta: "- Ưu tiên ngũ cốc nguyên hạt và rau " }],
    ["answer.citation", { section_id: "advice-2", citation_id: CITATION_ID, label: 1 }],
    ["answer.section.completed", { section_id: "advice-2" }],
    ["answer.section.started", { section_id: "basis-3", kind: "basis", title: "Căn cứ", order: 3 }],
    ["answer.text.delta", { section_id: "basis-3", text_delta: "- Eating well with prediabetes (NIDDK) " }],
    ["answer.citation", { section_id: "basis-3", citation_id: CITATION_ID, label: 1 }],
    ["answer.section.completed", { section_id: "basis-3" }],
    ["answer.final", {
      answer: finalAnswer("answered", [
        { id: "risk-1", kind: "risk", title: "Ước lượng nguy cơ", content: [{ type: "text", text: RISK_TEXT }] },
        { id: "advice-2", kind: "advice", title: "Lời khuyên", content: advice },
        { id: "basis-3", kind: "basis", title: "Căn cứ", content: basis },
      ], sources, [citationRecord], `${RISK_TEXT}\n\n- Ưu tiên ngũ cốc nguyên hạt và rau [1]`, agent, warnings),
    }],
    ["stream.completed", { finish_reason: "stop" }],
  ];
}

export const EMERGENCY_TEXT = "Những dấu hiệu anh/chị mô tả có thể là tình huống cấp cứu. Hãy gọi **115** hoặc đến cơ sở y tế gần nhất ngay.";

export function emergencyEvents(): StreamEvent[] {
  const trace = [
    step("safety_in", "An toàn (vào)", "Phát hiện dấu hiệu khẩn cấp, dừng luồng tư vấn", 0),
    step("safety_out", "An toàn (ra)", "Đã kiểm 0 phần do LLM viết; cờ: emergency", 0),
  ];
  const warnings = [{ code: "emergency", message: "Phát hiện dấu hiệu khẩn cấp; luồng tư vấn đã dừng." }];
  return [
    ["stream.started", { capabilities: ["agent_trace"] }],
    ...stepEvents(trace),
    ["sources.snapshot", { revision: 1, sources: [] }],
    ["answer.started", { state: "emergency", section_order: ["emergency"] }],
    ["answer.section.started", { section_id: "emergency-1", kind: "emergency", title: "Cần đi khám ngay", order: 1 }],
    ["answer.text.delta", { section_id: "emergency-1", text_delta: EMERGENCY_TEXT }],
    ["answer.section.completed", { section_id: "emergency-1" }],
    ["answer.final", {
      answer: finalAnswer("emergency", [{ id: "emergency-1", kind: "emergency", title: "Cần đi khám ngay", content: [{ type: "text", text: EMERGENCY_TEXT }] }], [], [], EMERGENCY_TEXT, agentInfo({ intent: "", trace, safety_flags: ["emergency"] }), warnings),
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
