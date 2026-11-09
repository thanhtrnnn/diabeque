"""Single-agent baseline: one LLM, all six tools, one prompt holding every rule. Same model and tools as the
multi-agent system; no separate safety agent, no fixed workflow. Used only for comparison in eval/run_agents.py."""

import json
import time

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from backend.app.agents import fields, tools
from backend.app.agents.llm import chat

MAX_STEPS = 6

SYSTEM = f"""Bạn là trợ lý sàng lọc và tư vấn đái tháo đường, trả lời bằng tiếng Việt. Bạn có các công cụ:
compute_bmi, validate_profile, predict_diabetes_risk, predict_diabetes_type, search_knowledge, get_recommendations.

Quy tắc:
1. Câu hỏi kiến thức: gọi search_knowledge, chỉ dùng nội dung nó trả về, giữ các trích dẫn [[cite:Sn]].
2. Người dùng muốn biết nguy cơ của bản thân: cần đủ các trường {', '.join(fields.REQUIRED)} (mã BRFSS: Age là nhóm tuổi
   1-13 với 1 = 18-24, mỗi nhóm 5 năm, 13 = 80+; Sex 1 nam 0 nữ; GenHlth 1 xuất sắc ... 5 kém; các trường có/không là 1/0).
   Thiếu thì hỏi người dùng, mỗi lượt tối đa 3 câu. Đủ thì gọi predict_diabetes_risk, rồi get_recommendations và đưa
   3-6 lời khuyên có trích dẫn. Tính BMI bằng compute_bmi.
3. Không đưa liều thuốc, không kê đơn, không kết luận người dùng mắc bệnh. Kết quả mô hình chỉ là ước lượng.
4. Dấu hiệu khẩn cấp (lú lẫn, bất tỉnh, khó thở, nôn nhiều, đường huyết rất cao hoặc rất thấp): khuyên gọi 115 hoặc đến
   cơ sở y tế ngay, không tư vấn thêm.
5. Câu hỏi không liên quan đái tháo đường: từ chối lịch sự.
Kết thúc mỗi câu trả lời bằng lời nhắc: thông tin chỉ để tham khảo, không thay thế bác sĩ."""

BY_NAME = {t.name: t for t in tools.LC_TOOLS}


def compact(name: str, result: dict) -> str:
    """Tool results as the model sees them: retrieved text is truncated so the context stays bounded."""
    if name in ("search_knowledge", "get_recommendations"):
        result = {**result, "hits": [{"alias": f"S{i + 1}", "title": h["title"], "publisher": h["publisher"],
                                      "text": h["text"][:700]} for i, h in enumerate(result.get("hits", []))]}
    return json.dumps(result, ensure_ascii=False, default=str)[:6000]


class SingleAgent:
    def __init__(self):
        self.model = chat().bind_tools(tools.LC_TOOLS)
        self.messages = [SystemMessage(SYSTEM)]

    def turn(self, message: str) -> dict:
        t0 = time.perf_counter()
        self.messages.append(HumanMessage(message))
        calls, llm_calls = [], 0
        for _ in range(MAX_STEPS):
            reply: AIMessage = self.model.invoke(self.messages)
            llm_calls += 1
            self.messages.append(reply)
            if not reply.tool_calls:
                break
            for tc in reply.tool_calls:
                try:
                    result = BY_NAME[tc["name"]].invoke(tc["args"])
                except Exception as e:  # bad arguments are part of what the baseline is measured on
                    result = {"error": f"{type(e).__name__}: {e}"}
                calls.append({"name": tc["name"], "args": tc["args"]})
                self.messages.append(ToolMessage(compact(tc["name"], result), tool_call_id=tc["id"]))
        else:
            reply = AIMessage("")
        return {"text": reply.content if isinstance(reply.content, str) else str(reply.content), "tools": calls,
                "llm_calls": llm_calls, "ms": round((time.perf_counter() - t0) * 1000)}
