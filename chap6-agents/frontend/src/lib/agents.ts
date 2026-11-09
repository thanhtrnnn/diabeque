/** Static facts about the supervisor graph, mirroring `backend/app/agents/{state,graph,nodes}.py`. A test checks the ids. */
export const AGENT_IDS = ["safety_in", "orchestrator", "intake", "risk", "knowledge", "advisor", "safety_out"] as const;
export type AgentId = typeof AGENT_IDS[number];

/** Vietnamese labels as `backend/app/agents/state.py::AGENT_LABELS`; the live list from `/api/v1/agents` wins when it loads. */
export const AGENT_LABELS: Record<AgentId, string> = {
  safety_in: "An toàn (vào)",
  orchestrator: "Điều phối",
  intake: "Thu thập thông tin",
  risk: "Dự đoán nguy cơ",
  knowledge: "Tra cứu tri thức",
  advisor: "Tư vấn",
  safety_out: "An toàn (ra)",
};

export interface AgentEntry {
  id: string;
  label: string;
}

export interface AgentsResponse {
  agents: AgentEntry[];
  mermaid: string;
}

export interface AgentDetail {
  role: string;
  /** Tools the agent calls, or the kind of check it runs when it calls none. */
  tools: string[];
}

export const AGENT_DETAILS: Record<AgentId, AgentDetail> = {
  safety_in: {
    role: "Quét tin nhắn tìm dấu hiệu cấp cứu bằng luật (hôn mê, khó thở, đau ngực, đường huyết quá thấp hoặc quá cao). Nếu có, dừng luồng tư vấn và chuyển thẳng tới lớp an toàn đầu ra.",
    tools: ["Luật regex, không gọi mô hình"],
  },
  orchestrator: {
    role: "Phân loại ý định: hỏi kiến thức, muốn đánh giá nguy cơ, chào hỏi hoặc ngoài phạm vi, rồi chọn nhánh tiếp theo. Có luật dự phòng khi mô hình ngôn ngữ không phản hồi.",
    tools: ["IntentDecision (mô hình ngôn ngữ)"],
  },
  intake: {
    role: "Trích thông tin sức khỏe từ tin nhắn, ghép với hồ sơ đã có của hội thoại, kiểm tra miền giá trị. Thiếu trường bắt buộc thì đặt câu hỏi và kết thúc lượt này.",
    tools: ["IntakeExtraction (mô hình ngôn ngữ)", "compute_bmi", "validate_profile"],
  },
  risk: {
    role: "Chạy mô hình phân loại trên hồ sơ BRFSS: ba nhóm tình trạng, hoặc Type 1 và Type 2 nếu người dùng đã được chẩn đoán. Trả xác suất đã khôi phục tần suất của dữ liệu.",
    tools: ["predict_diabetes_risk", "predict_diabetes_type"],
  },
  knowledge: {
    role: "Trả lời câu hỏi kiến thức bằng RAG trên đồ thị tri thức: truy xuất BM25, vector và đồ thị, sinh câu trả lời, rồi loại mọi ý không còn trích dẫn hợp lệ.",
    tools: ["search_knowledge"],
  },
  advisor: {
    role: "Viết lời khuyên cho đúng hồ sơ và kết quả ước lượng, chỉ từ các đoạn nguồn truy xuất theo yếu tố nguy cơ của người đó. Mỗi ý phải có trích dẫn.",
    tools: ["get_recommendations (mô hình ngôn ngữ viết lời khuyên)"],
  },
  safety_out: {
    role: "Kiểm lại phần do mô hình viết: bỏ câu có liều thuốc, bỏ câu kết luận chẩn đoán cho cá nhân, bỏ phần không còn trích dẫn. Ghi cờ cảnh báo vào kết quả.",
    tools: ["Luật regex, không gọi mô hình"],
  },
};

export interface AgentEdge {
  from: string;
  to: string;
  /** What decides this branch; absent on edges that always run. */
  when?: string;
}

/** The conditional edges of `graph.py`, for the legend under the diagram. */
export const AGENT_BRANCHES: AgentEdge[] = [
  { from: "safety_in", to: "orchestrator", when: "không có dấu hiệu khẩn cấp" },
  { from: "safety_in", to: "safety_out", when: "có dấu hiệu khẩn cấp" },
  { from: "orchestrator", to: "knowledge", when: "ý định là hỏi kiến thức" },
  { from: "orchestrator", to: "intake", when: "ý định là đánh giá nguy cơ" },
  { from: "orchestrator", to: "safety_out", when: "chào hỏi hoặc ngoài phạm vi" },
  { from: "intake", to: "risk", when: "hồ sơ đủ trường bắt buộc" },
  { from: "intake", to: "safety_out", when: "còn thiếu thông tin, hỏi lại người dùng" },
];
