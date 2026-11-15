/**
 * DEV/TEST ONLY. Hand-made runs for checking the diorama while the LLM endpoint is down and `scenarios.json`
 * is still empty. Not product data: Task 12's page replays recorded scenarios instead.
 */
import type { AgentStep } from "@/lib/chat-stream-contract";
import type { RunEvent } from "./run-state";
import type { Scenario } from "./scenarios";

const s = (agent: string, summary: string, extra: Partial<AgentStep> = {}): AgentStep => ({
  agent, label: agent, summary, tools: [], ms: 12, fallback: null, ...extra,
});
const tool = (name: string, result: unknown = "ok") => ({ name, args: {}, result });
const answer = [{ kind: "answer", title: "", text: "" }];
const question = [{ kind: "question", title: "", text: "" }];

export const DEV_SCENARIOS: Scenario[] = [
  {
    id: "dev-emergency", label: "Khẩn cấp",
    turns: [{ message: "khó thở, đau ngực", sections: answer, steps: [
      s("safety_in", "Phát hiện dấu hiệu cấp cứu, chuyển thẳng ra lớp an toàn.", { ms: 0 }),
      s("safety_out", "Gửi hướng dẫn gọi cấp cứu 115.", { ms: 0 }),
    ] }],
  },
  {
    id: "dev-knowledge", label: "Hỏi kiến thức",
    turns: [{ message: "HbA1c là gì", sections: answer, steps: [
      s("safety_in", "Không có dấu hiệu khẩn cấp."),
      s("orchestrator", "Ý định: hỏi kiến thức."),
      s("knowledge", "Tìm được 5 đoạn nguồn, giữ 3 ý có trích dẫn.", { tools: [tool("search_knowledge")] }),
      s("safety_out", "Câu trả lời an toàn."),
    ] }],
  },
  {
    id: "dev-loop", label: "Vòng lặp 2 lượt",
    turns: [
      { message: "tôi muốn biết nguy cơ", sections: question, steps: [
        s("safety_in", "Không có dấu hiệu khẩn cấp."),
        s("orchestrator", "Ý định: đánh giá nguy cơ."),
        s("intake", "Có 4/7 trường, hỏi thêm 3 câu.", { tools: [tool("compute_bmi")] }),
        s("safety_out", "Gửi câu hỏi bổ sung."),
      ] },
      { message: "huyết áp cao, 50 tuổi, nam", sections: answer, steps: [
        s("safety_in", "Không có dấu hiệu khẩn cấp."),
        s("orchestrator", "Ý định: đánh giá nguy cơ."),
        s("intake", "Đủ 7/7 trường.", { tools: [tool("compute_bmi"), tool("validate_profile")] }),
        s("risk", "Tiền tiểu đường 35%.", { tools: [tool("predict_diabetes_risk")] }),
        s("advisor", "Viết 4 lời khuyên có trích dẫn.", { tools: [tool("get_recommendations")] }),
        s("safety_out", "Đã kiểm 3 phần do LLM viết; cờ: dosage_removed"),
      ] },
    ],
  },
  {
    id: "dev-greeting", label: "Chào hỏi",
    turns: [{ message: "xin chào", sections: answer, steps: [
      s("safety_in", "Không có dấu hiệu khẩn cấp."),
      s("orchestrator", "Ý định: greeting (LLM: lời chào)."),
      s("safety_out", "Câu trả lời an toàn."),
    ] }],
  },
  {
    id: "dev-fallback", label: "LLM sập",
    turns: [{ message: "tôi muốn biết nguy cơ", sections: question, steps: [
      s("safety_in", "Không có dấu hiệu khẩn cấp."),
      s("orchestrator", "Ý định: assess_risk (luật dự phòng: mô hình không phản hồi).", { fallback: "rules" }),
      s("intake", "Trích trường bằng luật.", { fallback: "rules" }),
      s("safety_out", "Gửi câu hỏi bổ sung."),
    ] }],
  },
];

/** A turn whose knowledge tool fails: no scenario can carry `agent.error`, so this is a raw event list. */
export const DEV_ERROR_RUN: RunEvent[] = [
  { type: "start", turn: 1 },
  { type: "step", step: s("safety_in", "Không có dấu hiệu khẩn cấp.") },
  { type: "step", step: s("orchestrator", "Ý định: hỏi kiến thức.") },
  { type: "agentError", node: "knowledge", errorType: "ServiceUnavailable" },
  { type: "streamError", message: "Không truy vấn được Neo4j." },
  { type: "finish", awaitingIntake: false },
];
