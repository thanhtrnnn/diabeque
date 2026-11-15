/**
 * Who works in the candy works: one original character per agent, with the facts its character sheet shows.
 * Tools and fallbacks mirror `backend/app/agents/{nodes,tools}.py`; the props (gate, exit, memory safe) get a
 * short note instead. Mood and prop cues for the 3D rigs live in `cues.ts`.
 */
import type { AgentId } from "@/lib/agents";
import type { StationId } from "./layout";

export interface CastMember {
  name: string;
  /** What the agent does, one or two sentences. */
  role: string;
  /** Calls the language model (an LLM station with a cotton-candy feed line), or runs code only. */
  llm: boolean;
  /** Tool functions it calls, by their names in `tools.py` (each one is a machine in its room). */
  tools: string[];
  /** What happens when the LLM or a tool fails. */
  fallback: string;
}

export const CAST: Record<AgentId, CastMember> = {
  safety_in: {
    name: "Bác Gác Cổng",
    role: "Quét tin nhắn bằng luật tìm dấu hiệu cấp cứu (khó thở, đau ngực, hôn mê, đường huyết quá thấp hoặc quá cao). Có dấu hiệu thì thổi còi và đưa thẳng ra cửa an toàn, 0 ms, không gọi LLM.",
    llm: false,
    tools: [],
    fallback: "Chỉ chạy luật nên không phụ thuộc LLM. Nếu chính bước này ném lỗi, lượt dừng ở đây và báo lỗi, chưa có dự phòng.",
  },
  orchestrator: {
    name: "Cô Bẻ Ghi",
    role: "Đọc ý định của tin nhắn (hỏi kiến thức, đánh giá nguy cơ, chào hỏi, ngoài phạm vi) rồi kéo cần gạt để ray đổi sang đúng nhánh.",
    llm: true,
    tools: [],
    fallback: "LLM sập thì lật sổ luật: nhận ý định bằng từ khóa, bước được gắn cờ dự phòng \"rules\".",
  },
  intake: {
    name: "Chú Sổ Tay",
    role: "Trích thông tin sức khỏe từ tin nhắn, ghép vào hồ sơ đã lưu của hội thoại và ghi lên bảng kẹp x/7 trường. Thiếu trường thì hỏi tối đa 3 câu và dừng lượt, lượt sau làm tiếp.",
    llm: true,
    tools: ["compute_bmi", "validate_profile"],
    fallback: "LLM sập thì trích bằng luật (regex tuổi, cân nặng, chiều cao, có/không), cờ dự phòng \"rules\".",
  },
  risk: {
    name: "Cụ Cân Đong",
    role: "Chạy mô hình CNN-1D trên hồ sơ BRFSS để ước lượng ba nhóm tình trạng, hoặc LSTM phân Type 1 / Type 2 khi đã được chẩn đoán. Cân nghiêng theo xác suất.",
    llm: false,
    tools: ["predict_diabetes_risk", "predict_diabetes_type"],
    fallback: "Chỉ chạy code. Nếu mô hình lỗi, lượt dừng ở đây và báo lỗi tool, chưa có dự phòng.",
  },
  knowledge: {
    name: "Bé Đèn Pin",
    role: "Đội mũ đèn đi thang máy xuống hầm tri thức Neo4j: truy xuất vector, BM25 và đồ thị, viết câu trả lời rồi chỉ giữ ý có trích dẫn hợp lệ.",
    llm: true,
    tools: ["search_knowledge", "search_passages"],
    fallback: "LLM sập thì trả 3 đoạn tài liệu truy xuất được, mỗi đoạn kèm trích dẫn, cờ dự phòng \"passages\". Neo4j lỗi thì báo lỗi tool.",
  },
  advisor: {
    name: "Chị Pha Chế",
    role: "Rót lời khuyên hợp với hồ sơ và kết quả ước lượng, chỉ từ các đoạn nguồn lấy theo yếu tố nguy cơ của người đó, mỗi ý một trích dẫn.",
    llm: true,
    tools: ["get_recommendations"],
    fallback: "LLM sập thì liệt kê khuyến nghị lấy từ dữ kiện đồ thị tri thức, kèm trích dẫn đoạn gốc, cờ dự phòng \"graph_facts\".",
  },
  safety_out: {
    name: "Ông Soát Vé",
    role: "Kiểm lại mọi phần do LLM viết: bỏ câu có liều thuốc (đóng dấu đỏ), bỏ câu kết luận chẩn đoán cá nhân, bỏ phần không còn trích dẫn, rồi ghi lịch sử hội thoại.",
    llm: false,
    tools: [],
    fallback: "Chỉ chạy luật nên không phụ thuộc LLM. Phần dự phòng của các phòng trước cũng đi qua đây và được lọc như mọi phần khác.",
  },
};

/** The three props are not agents: a sentence each for their sheet. */
export const PROP_NOTES: Record<Exclude<StationId, AgentId>, { name: string; note: string }> = {
  gate: { name: "Cửa vào", note: "Mỗi tin nhắn được gói thành một viên kẹo và đi vào đây, mang theo mã hội thoại để lượt sau nối tiếp." },
  exit: { name: "Trả lời", note: "Viên kẹo ra khỏi xưởng thành câu trả lời có trích dẫn. Khi Thu thập còn hỏi lại, ray vòng về két nhớ chờ lượt sau." },
  memory: { name: "Két nhớ", note: "InMemorySaver của LangGraph: giữ hồ sơ và lịch sử theo từng hội thoại. Sáng lên khi lượt dừng chờ người dùng bổ sung thông tin." },
};
