"""The agents. Each node reads the shared state, does one job, and returns the keys it changed plus a trace step."""

import json
import re
import time
import uuid
from datetime import UTC, datetime
from collections.abc import Callable
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from .. import answer as gen
from ..config import ROOT, settings
from . import fields, rules, safety, tools
from .coderef import code_ref
from .llm import LLMUnavailable, ensure_llm, structured
from .state import AGENT_LABELS, Agent, Intent, SessionState, Step, ToolCall

# ------------------------------------------------------------------ helpers


def traced(agent: Agent) -> Callable:
    """Time the node and append its step to the turn trace.

    A node returns (update, summary, calls), plus a fourth item, "rules", when its LLM path failed and rules answered."""

    def wrap(fn: Callable[[SessionState], tuple]):
        code = code_ref(fn)

        def node(state: SessionState) -> dict:
            t0 = time.perf_counter()
            try:
                update, summary, calls, *rest = fn(state)
            except Exception as exc:
                exc.diabeque_node = agent.value  # lets the API say which agent failed
                raise
            fallback = rest[0] if rest else None
            step: Step = {"agent": agent.value, "label": AGENT_LABELS[agent], "summary": summary, "tools": calls,
                          "ms": round((time.perf_counter() - t0) * 1000), "code": code, "fallback": fallback,
                          "request_id": update.get("request_id") or state.get("request_id", ""),
                          "status": "fallback" if fallback else "ok",
                          "version": step_version(agent, state, update, fallback),
                          "evidence": step_evidence(state, update)}
            return {**update, "trace": [*state.get("trace", []), step]}

        node.__name__ = agent.value
        return node

    return wrap


LLM_AGENTS = {Agent.ORCHESTRATOR, Agent.INTAKE, Agent.KNOWLEDGE, Agent.ADVISOR}
CODE_VERSION = "diabeque-agents.v2"


def step_version(agent: Agent, state: SessionState, update: dict, fallback: str | None) -> str:
    if agent == Agent.RISK and (r := update.get("risk")):
        return r.get("model_version", r.get("model", ""))
    if agent == Agent.RULES:
        return rules.RULESET_VERSION
    if agent in LLM_AGENTS and not fallback:
        return settings().model_name
    return CODE_VERSION


def step_evidence(state: SessionState, update: dict) -> list[str]:
    """What the step added as support: new source chunks, or fired rule ids."""
    if "rules" in update:
        return [r["id"] for r in update["rules"] if r["fired"]]
    before = len(state.get("sources", []))
    return [h.get("chunk_id", "") for h in update.get("sources", [])[before:]]


def call(name: str, args: dict, result) -> ToolCall:
    record: ToolCall = {"name": name, "args": args, "result": result}
    if (fn := tools.BY_NAME.get(name)) is not None:
        record["code"] = code_ref(fn)
    return record


def history_text(state: SessionState, turns: int = 3) -> str:
    rows = []
    for h in state.get("history", [])[-turns:]:
        rows.append(f"Người dùng: {h['user']}\nTrợ lý: {h['assistant'][:400]}")
    return "\n\n".join(rows) or "(chưa có)"


def offset_citations(text: str, offset: int) -> str:
    """Renumber [[cite:Sn]] by `offset` so citations from several agents index one shared sources list."""
    return gen.CITE.sub(lambda m: f"[[cite:S{int(m.group(1)[1:]) + offset}]]", text)


# ------------------------------------------------------------------ safety (in)


@traced(Agent.SAFETY_IN)
def safety_in(state: SessionState):
    if safety.is_emergency(state["message"]):
        section = {"kind": "emergency", "title": "Cần đi khám ngay", "text": safety.EMERGENCY_TEXT}
        return {"emergency": True, "sections": [section], "safety_flags": ["emergency"]}, "Phát hiện dấu hiệu khẩn cấp, dừng luồng tư vấn", []
    return {"emergency": False}, "Không có dấu hiệu khẩn cấp", []


# ------------------------------------------------------------------ orchestrator

RISK_WORDS = re.compile(r"nguy cơ|có bị|có mắc|kiểm tra giúp|đánh giá|tư vấn cho tôi|\d+\s*(kg|tuổi)|cao \d", re.I)
GREETING_WORDS = re.compile(r"^\s*(xin chào|chào|hello|hi|alo)\b|bạn (là ai|làm được gì)", re.I)


class IntentDecision(BaseModel):
    """Phân loại ý định của tin nhắn mới nhất."""

    intent: Literal["knowledge", "assess_risk", "greeting", "out_of_scope"] = Field(
        description="knowledge: hỏi kiến thức chung về đái tháo đường (triệu chứng, chẩn đoán, ăn uống, thuốc, biến chứng). "
        "assess_risk: người dùng muốn biết nguy cơ của bản thân, nhờ tư vấn theo tình trạng của mình, hoặc đang trả lời "
        "câu hỏi thu thập thông tin. greeting: chào hỏi, hỏi hệ thống làm được gì. out_of_scope: không liên quan đái tháo đường."
    )
    reason: str = Field(description="Một câu ngắn giải thích.")


ORCHESTRATOR_PROMPT = """Bạn là agent điều phối của trợ lý sàng lọc và tư vấn đái tháo đường.
Hội thoại gần đây:
{history}

Trạng thái: {status}
Tin nhắn mới: {message}

Lưu ý: câu hỏi chung về thuốc, liều thuốc, insulin, chế độ ăn, xét nghiệm là knowledge, kể cả khi bắt đầu bằng "tôi nên".
Chọn assess_risk khi người dùng muốn biết nguy cơ của chính mình, khi tin nhắn có thông tin sức khỏe cá nhân
(tuổi, cân nặng, chiều cao, bệnh nền, thói quen vận động), hoặc khi đang trả lời câu hỏi thu thập thông tin.

Gọi công cụ IntentDecision để phân loại ý định của tin nhắn mới."""


def fallback_intent(state: SessionState) -> str:
    msg = state["message"]
    if state.get("awaiting_intake") and not msg.rstrip().endswith("?"):
        return Intent.ASSESS_RISK
    if GREETING_WORDS.search(msg):
        return Intent.GREETING
    if RISK_WORDS.search(msg):
        return Intent.ASSESS_RISK
    return Intent.KNOWLEDGE


GREETING_TEXT = (
    "Xin chào, tôi là Diabeque, trợ lý sàng lọc và tư vấn đái tháo đường. Tôi có thể:\n"
    "- trả lời câu hỏi kiến thức về đái tháo đường, có trích dẫn nguồn y tế;\n"
    "- hỏi anh/chị vài thông tin sức khỏe để **ước lượng nguy cơ** (không phải chẩn đoán) và đưa lời khuyên có căn cứ.\n"
    "Ví dụ: \"Tôi 52 tuổi, cao 1m62, nặng 75kg, huyết áp cao, tôi có nguy cơ tiểu đường không?\""
)
OUT_OF_SCOPE_TEXT = "Câu hỏi nằm ngoài phạm vi của trợ lý. Tôi chỉ hỗ trợ thông tin và sàng lọc nguy cơ đái tháo đường."


@traced(Agent.ORCHESTRATOR)
def orchestrator(state: SessionState):
    status = "đang chờ người dùng trả lời câu hỏi thu thập thông tin" if state.get("awaiting_intake") else "bình thường"
    prompt = ORCHESTRATOR_PROMPT.format(history=history_text(state), status=status, message=state["message"])
    fallback = None
    try:
        ensure_llm(state)
        decision = structured(IntentDecision).invoke(prompt)
        intent, how = decision.intent, f"LLM: {decision.reason}"
    except Exception as e:  # endpoint down or malformed tool call: rules keep the system usable
        intent, how, fallback = fallback_intent(state), f"luật dự phòng ({type(e).__name__})", "rules"
    update: dict = {"intent": intent, "request_id": state.get("request_id") or f"req_{uuid.uuid4().hex[:12]}"}
    if intent == Intent.GREETING:
        update["sections"] = [{"kind": "notice", "title": "Giới thiệu", "text": GREETING_TEXT}]
    elif intent == Intent.OUT_OF_SCOPE:
        update["sections"] = [{"kind": "notice", "title": "Ngoài phạm vi", "text": OUT_OF_SCOPE_TEXT}]
    return update, f"Ý định: {intent} ({how})", [], fallback


# ------------------------------------------------------------------ intake


class IntakeExtraction(BaseModel):
    """Thông tin sức khỏe người dùng nêu rõ trong tin nhắn. Bỏ trống (null) mọi trường không được nêu."""

    age_years: float | None = Field(None, description="Tuổi (năm)")
    sex: Literal["male", "female"] | None = None
    height_m: float | None = Field(None, description="Chiều cao, mét hoặc cm")
    weight_kg: float | None = None
    bmi: float | None = Field(None, description="Chỉ khi người dùng nói thẳng chỉ số BMI")
    high_bp: bool | None = Field(None, description="Đã được nói là huyết áp cao")
    high_chol: bool | None = Field(None, description="Đã được nói là cholesterol / mỡ máu cao")
    phys_activity: bool | None = Field(None, description="Có vận động thể chất ngoài công việc trong 30 ngày qua")
    gen_hlth: int | None = Field(None, description="Tự đánh giá sức khỏe: 1 xuất sắc, 2 rất tốt, 3 tốt, 4 trung bình, 5 kém")
    smoker: bool | None = Field(None, description="Đã hút ít nhất 100 điếu thuốc trong đời")
    stroke: bool | None = None
    heart_disease: bool | None = Field(None, description="Bệnh mạch vành hoặc nhồi máu cơ tim")
    diff_walk: bool | None = Field(None, description="Khó đi bộ hoặc leo cầu thang")
    heavy_alcohol: bool | None = Field(None, description="Uống rượu bia nhiều")
    diagnosed_diabetes: bool | None = Field(None, description="Đã được bác sĩ chẩn đoán đái tháo đường")

    @field_validator("sex", mode="before")
    @classmethod
    def normalise_sex(cls, v):
        if isinstance(v, str):
            v = v.strip().lower()
            return {"nam": "male", "male": "male", "m": "male", "nữ": "female", "nu": "female", "female": "female",
                    "f": "female"}.get(v, v)
        return v


BOOL_FIELDS = {"high_bp": "HighBP", "high_chol": "HighChol", "phys_activity": "PhysActivity", "smoker": "Smoker",
               "stroke": "Stroke", "heart_disease": "HeartDiseaseorAttack", "diff_walk": "DiffWalk",
               "heavy_alcohol": "HvyAlcoholConsump"}

INTAKE_PROMPT = """Bạn là agent thu thập thông tin. Trích MỌI thông tin sức khỏe mà người dùng nêu rõ, kể cả câu phủ định.
Không đoán điều người dùng không nói. "có"/"không" ngắn gọn là câu trả lời cho câu hỏi trợ lý vừa hỏi.
Ví dụ: "mỡ máu cao" -> high_chol=true; "huyết áp bình thường" -> high_bp=false; "ít vận động" -> phys_activity=false;
"sức khỏe tốt" -> gen_hlth=3; "từng bị nhồi máu cơ tim" -> heart_disease=true; "bác sĩ nói tôi bị tiểu đường" -> diagnosed_diabetes=true.

Trợ lý vừa hỏi: {asked}
Người dùng: {message}

Gọi công cụ IntakeExtraction."""


AGE_RE = re.compile(r"\b(\d{2})\s*tuổi", re.I)
MALE_RE = re.compile(r"(?<!việt )\b(nam|đàn ông|nam giới)\b", re.I)
FEMALE_RE = re.compile(r"\b(nữ|phụ nữ|nữ giới)\b", re.I)
HEIGHT_RE = re.compile(r"\b(1)\s*m\s*(\d{1,2})\b|\b(1[.,]\d{1,2})\s*m\b|\b(1\d{2})\s*cm\b", re.I)
WEIGHT_RE = re.compile(r"\b(\d{2,3}(?:[.,]\d)?)\s*(kg|ký|cân)\b", re.I)


NEG = re.compile(r"\b(không|chưa|bình thường|ổn|ổn định)\b", re.I)
POS = re.compile(r"\b(cao|bị|có|tăng)\b", re.I)
SUBJECTS = {
    "high_bp": re.compile(r"huyết áp", re.I),
    "high_chol": re.compile(r"mỡ máu|cholesterol|cholesteron", re.I),
}
INACTIVE = re.compile(r"ít (vận động|tập)|không (tập|vận động|chơi thể thao)|lười (vận động|tập)|ngồi nhiều", re.I)
ACTIVE = re.compile(r"(có|thường|hay|vẫn)\s+(tập|vận động|chạy bộ|đi bộ|đạp xe|chơi thể thao)|tập (thể dục|thể thao|gym)|chơi thể thao|chạy bộ|đạp xe", re.I)
GEN_HLTH = [(re.compile(r"xuất sắc", re.I), 1), (re.compile(r"rất tốt", re.I), 2), (re.compile(r"\bkém\b|\byếu\b", re.I), 5),
            (re.compile(r"trung bình", re.I), 4), (re.compile(r"\btốt\b", re.I), 3)]


def yes_no(message: str, subject: re.Pattern) -> bool | None:
    """Read a yes/no for `subject` from the words after it, up to the next subject that has its own predicate.

    "huyết áp cao và mỡ máu bình thường" gives huyết áp = có; "huyết áp và mỡ máu bình thường" gives both = không."""
    for clause in re.split(r"[,.;\n]|\bnhưng\b", message):
        m = subject.search(clause)
        if not m:
            continue
        rest = clause[m.end():]
        others = [o.search(rest) for o in SUBJECTS.values() if o is not subject]
        cut = min((o.start() for o in others if o), default=len(rest))
        own = rest[:cut]
        words = own if (NEG.search(own) or POS.search(own)) else rest
        before = clause[: m.start()]
        if NEG.search(words) or re.search(r"\bkhông\s+(bị\s+)?$", before):
            return False
        if POS.search(words) or re.search(r"\b(bị|có|tăng)\s+$", before):
            return True
    return None


def rule_extract(message: str) -> IntakeExtraction:
    """Regex pass for the facts users state most often; fills what the LLM extraction leaves empty."""
    x = IntakeExtraction()
    if m := AGE_RE.search(message):
        x.age_years = float(m.group(1))
    male, female = bool(MALE_RE.search(message)), bool(FEMALE_RE.search(message))
    if male != female:
        x.sex = "male" if male else "female"
    if m := HEIGHT_RE.search(message):
        if m.group(1):
            x.height_m = 1 + int(m.group(2)) / (10 if len(m.group(2)) == 1 else 100)
        elif m.group(3):
            x.height_m = float(m.group(3).replace(",", "."))
        else:
            x.height_m = int(m.group(4)) / 100
    if m := WEIGHT_RE.search(message):
        x.weight_kg = float(m.group(1).replace(",", "."))
    for attr, subject in SUBJECTS.items():
        setattr(x, attr, yes_no(message, subject))
    if INACTIVE.search(message):
        x.phys_activity = False
    elif ACTIVE.search(message):
        x.phys_activity = True
    for clause in re.split(r"[,.;\n]", message):
        if re.search(r"sức khỏe|sức khoẻ", clause, re.I):
            x.gen_hlth = next((v for pat, v in GEN_HLTH if pat.search(clause)), None)
            break
    return x


def merge(llm: IntakeExtraction, rules: IntakeExtraction) -> IntakeExtraction:
    return llm.model_copy(update={k: v for k, v in rules.model_dump().items() if v is not None and getattr(llm, k) is None})


def to_features(x: IntakeExtraction) -> tuple[dict[str, float], list[dict]]:
    """Map extracted answers to BRFSS codes; BMI comes from the compute_bmi tool."""
    feats, calls = {}, []
    if x.age_years is not None and (group := fields.age_group(x.age_years)) is not None:
        feats["Age"] = group
    if x.sex:
        feats["Sex"] = 1 if x.sex == "male" else 0
    if x.height_m and x.weight_kg:
        out = tools.compute_bmi(x.height_m, x.weight_kg)
        calls.append(call("compute_bmi", {"height_m": x.height_m, "weight_kg": x.weight_kg}, out))
        feats["BMI"] = out["bmi"]
    elif x.bmi:
        feats["BMI"] = x.bmi
    if x.gen_hlth:
        feats["GenHlth"] = x.gen_hlth
    for attr, name in BOOL_FIELDS.items():
        if (v := getattr(x, attr)) is not None:
            feats[name] = 1 if v else 0
    return feats, calls


@traced(Agent.INTAKE)
def intake(state: SessionState):
    asked = [fields.QUESTIONS[f] for f in state.get("asked", [])[-fields.ASK_PER_TURN:]] if state.get("awaiting_intake") else []
    prompt = INTAKE_PROMPT.format(asked=" ".join(asked) or "(không)", message=state["message"])
    fallback = None
    try:
        ensure_llm(state)
        x = structured(IntakeExtraction).invoke(prompt)
    except Exception as e:
        x, note, fallback = IntakeExtraction(), f"trích xuất lỗi ({type(e).__name__})", "rules"
    else:
        note = ""
    x = merge(x, rule_extract(state["message"]))
    feats, calls = to_features(x)
    checked = tools.validate_profile(feats)
    calls.append(call("validate_profile", {"profile": feats}, checked))
    profile = {**state.get("profile", {}), **checked["profile"]}
    diagnosed = x.diagnosed_diabetes if x.diagnosed_diabetes is not None else state.get("diagnosed")
    todo = fields.missing(profile)
    update = {"profile": profile, "diagnosed": diagnosed, "missing": todo}
    if todo:
        ask = todo[: fields.ASK_PER_TURN]
        text = "Để ước lượng nguy cơ, tôi cần thêm vài thông tin:\n" + "\n".join(f"- {fields.QUESTIONS[f]}" for f in ask)
        update |= {"awaiting_intake": True, "asked": [*state.get("asked", []), *ask],
                   "sections": [{"kind": "question", "title": "Cần thêm thông tin", "text": text}]}
        summary = f"Ghi nhận {len(checked['profile'])} trường; còn thiếu {', '.join(todo)}"
    else:
        update["awaiting_intake"] = False
        summary = f"Hồ sơ đủ {len(fields.REQUIRED)} trường bắt buộc ({len(profile)} trường đã có)"
    return update, summary + (f"; {note}" if note else ""), calls, fallback


# ------------------------------------------------------------------ risk


def pct(x: float) -> str:
    return f"{x:.0%}" if x >= 0.01 else "dưới 1%"


def risk_text(risk: dict, profile: dict) -> str:
    p = risk["probs_population"] or risk["probs"]
    model = risk["model"].upper()
    if risk["task"] == "status3":
        lines = [f"Trong dữ liệu khảo sát BRFSS, mô hình **{model}** ước lượng tỷ lệ ở những người có hồ sơ tương tự:",
                 f"- không báo cáo mắc bệnh: **{pct(float(p['0']))}**",
                 f"- đã được thông báo tiền đái tháo đường: **{pct(float(p['1']))}**",
                 f"- đã được thông báo mắc đái tháo đường: **{pct(float(p['2']))}**",
                 f"Ở chế độ sàng lọc (ưu tiên không bỏ sót nhóm ít gặp), mô hình xếp hồ sơ vào nhóm: **{risk['label_name'].lower()}**."]
    else:
        lines = [f"Với người đã được chẩn đoán, mô hình **{model}** ước lượng:",
                 f"- Type 1: **{pct(float(p['1']))}**", f"- Type 2: **{pct(float(p['2']))}**"]
    lines.append("Đây là ước lượng thống kê từ câu trả lời tự báo cáo, **không phải chẩn đoán**. "
                 "Chỉ xét nghiệm đường huyết lúc đói, HbA1c hoặc nghiệm pháp dung nạp glucose mới xác định được tình trạng.")
    if risk["defaulted"]:
        lines.append(f"({len(risk['defaulted'])} thông tin chưa hỏi được điền bằng giá trị trung vị của dữ liệu huấn luyện.)")
    return "\n".join(lines)


@traced(Agent.RISK)
def risk(state: SessionState):
    profile = state["profile"]
    fn = tools.predict_diabetes_type if state.get("diagnosed") else tools.predict_diabetes_risk
    out = fn(profile)
    section = {"kind": "risk", "title": "Ước lượng nguy cơ", "text": risk_text(out, profile)}
    summary = f"{fn.__name__} → {out['label_name']} ({out['model']})"
    return {"risk": out, "sections": [*state.get("sections", []), section]}, summary, [call(fn.__name__, {"features": profile}, out)]


# ------------------------------------------------------------------ knowledge


PASSAGES_INTRO = "Không tạo được câu trả lời lúc này; dưới đây là các đoạn tài liệu liên quan."
PASSAGE_CHARS = 280


def passage_line(text: str, n: int) -> str | None:
    """One bullet for a retrieved chunk: its first PASSAGE_CHARS characters, cut at a word, with its citation.

    Sentences that safety_out would drop (dose, definitive diagnosis) are removed first, so the citation always sits on
    text that survives the filter. Returns None when nothing citable is left; callers skip that bullet."""
    flat, _ = safety.filter_text(" ".join(text.split()))
    if len(flat) > PASSAGE_CHARS:
        flat = flat[:PASSAGE_CHARS].rsplit(" ", 1)[0]
    line = f"- {flat} [[cite:S{n}]]"
    return line if flat and gen.CITE.search(safety.filter_text(line)[0]) else None


@traced(Agent.KNOWLEDGE)
def knowledge(state: SessionState):
    topic = (state.get("risk") or {}).get("topic")
    args = {"question": state["message"], "topic": topic}
    calls, fallback = [], None
    try:
        ensure_llm(state)
        out = tools.search_knowledge(state["message"], topic)
        calls.append(call("search_knowledge", args, {k: out[k] for k in ("state", "top_score", "used") if k in out}
                          | {"hits": [h["chunk_id"] for h in out["hits"]]}))
    except Exception as e:  # LLM down or generation failed: show the retrieved passages instead (Neo4j errors propagate)
        if not isinstance(e, LLMUnavailable):
            calls.append(call("search_knowledge", args, {"error": f"{type(e).__name__}: {e}"}))
        out = tools.search_passages(state["message"], topic)
        calls.append(call("search_passages", args, {"top_score": out["top_score"], "hits": [h["chunk_id"] for h in out["hits"]]}))
        fallback = "passages"
        out["state"] = "answered" if out["hits"] else "out_of_scope"
        lines = (passage_line(h["text"], i + 1) for i, h in enumerate(out["hits"]))
        out["text"] = "\n".join([PASSAGES_INTRO, *(ln for ln in lines if ln)])
    if out["state"] == "answered":
        title = "Đoạn tài liệu liên quan" if fallback else "Trả lời"
        sections = [{"kind": "conclusion", "title": title, "text": out["text"]}]
    elif out["state"] == "out_of_scope":
        sections = [{"kind": "notice", "title": "Ngoài phạm vi", "text": OUT_OF_SCOPE_TEXT}]
    else:
        sections = [{"kind": "notice", "title": "Chưa đủ bằng chứng",
                     "text": "Chưa tìm thấy bằng chứng trong kho tài liệu để trả lời câu hỏi này."}]
    summary = f"Dự phòng: {len(out['hits'])} đoạn tài liệu, không dùng LLM" if fallback else f"RAG: {out['state']}, {len(out.get('used', []))} trích dẫn"
    return {"sources": out["hits"], "sections": sections}, summary, calls, fallback


# ------------------------------------------------------------------ rules


@traced(Agent.RULES)
def rules_check(state: SessionState):
    texts = [h["user"] for h in state.get("history", [])] + [state["message"]]
    labs = {**state.get("labs", {}), **rules.parse_labs(texts)}
    results = rules.evaluate(state["profile"], labs, state.get("risk"))
    flags = rules.review_flags(results)
    section = {"kind": "rules", "title": "Đối chiếu luật sàng lọc", "text": rules.section_text(results)}
    fired = [r["id"] for r in results if r["fired"]]
    summary = f"{len(fired)}/{len(results)} luật kích hoạt" + (f"; cờ: {', '.join(flags)}" if flags else "")
    calls = [call("evaluate_rules", {"profile": state["profile"], "labs": labs}, {"fired": fired, "flags": flags})]
    return {"labs": labs, "rules": results, "sections": [*state.get("sections", []), section]}, summary, calls


def aggregate(state: SessionState) -> dict:
    """Coordinator aggregation F(y_DL, y_rule, y_KG): keeps prediction, rule results and evidence apart."""
    risk = state.get("risk") or {}
    results = state.get("rules", [])
    return {
        "request_id": state.get("request_id", ""),
        "prediction": {k: risk.get(k) for k in ("task", "label", "label_name", "model", "model_version")} if risk else None,
        "rules": [r["id"] for r in results if r["fired"]],
        "flags": rules.review_flags(results),
        "evidence": [h.get("chunk_id") for h in state.get("sources", [])],
    }


def decision_text(decision: dict, results: list[dict]) -> str:
    fired = [f"{r['id']} {r['title']}" for r in results if r["fired"]]
    lines = [f"LUẬT KÍCH HOẠT (độc lập với mô hình): {'; '.join(fired) or 'không có'}"]
    if decision["flags"]:
        lines.append(f"CỜ RÀ SOÁT: {', '.join(decision['flags'])}")
    return "\n".join(lines)


# ------------------------------------------------------------------ advisor

ADVISOR_SYSTEM = gen.SYSTEM + """
Bạn đang viết LỜI KHUYÊN cho một người cụ thể, dựa trên hồ sơ và kết quả ước lượng được cung cấp.
Chỉ đưa lời khuyên lối sống và khuyến nghị đi khám, xét nghiệm có trong NGUỒN. Ưu tiên các yếu tố nguy cơ trong hồ sơ.
Không nhắc lại con số xác suất. Không kết luận người dùng mắc bệnh."""

FACTOR_QUERIES = {
    "BMI": "giảm cân khi thừa cân béo phì để phòng đái tháo đường",
    "HighBP": "kiểm soát huyết áp cao ở người có nguy cơ đái tháo đường",
    "HighChol": "rối loạn mỡ máu cholesterol cao và đái tháo đường",
    "PhysActivity": "hoạt động thể lực tập thể dục phòng ngừa đái tháo đường",
}


def advisor_query(profile: dict, risk: dict) -> str:
    parts = []
    if profile.get("BMI", 0) >= 23:
        parts.append(FACTOR_QUERIES["BMI"])
    if profile.get("HighBP") == 1:
        parts.append(FACTOR_QUERIES["HighBP"])
    if profile.get("HighChol") == 1:
        parts.append(FACTOR_QUERIES["HighChol"])
    if profile.get("PhysActivity") == 0:
        parts.append(FACTOR_QUERIES["PhysActivity"])
    if risk["label"] != 0 or risk["task"] == "diabtype":
        parts.append("khi nào cần xét nghiệm đường huyết HbA1c để chẩn đoán")
    return "; ".join(parts) or "lối sống lành mạnh phòng ngừa đái tháo đường"


FACTS_INTRO = "Không tạo được lời khuyên riêng lúc này; dưới đây là các khuyến nghị trong kho tài liệu."
MAX_FACTS = 6


def graph_fact_lines(rec_hits: list[dict]) -> list[str]:
    """Bullets from the recommendation hits' graph facts: deduplicated, at most MAX_FACTS, each citing the hit it came from."""
    seen, lines = set(), []
    for i, h in enumerate(rec_hits):
        for fact in h.get("facts", []):
            if fact in seen or len(lines) >= MAX_FACTS:
                continue
            seen.add(fact)
            if line := passage_line(fact, i + 1):
                lines.append(line)
    return lines


@traced(Agent.ADVISOR)
def advisor(state: SessionState):
    profile, risk = state["profile"], state["risk"]
    query = advisor_query(profile, risk)
    rec = tools.get_recommendations(query, risk["topic"], k=6)
    calls = [call("get_recommendations", {"query": query, "topic": risk["topic"]},
                  {"hits": [h["chunk_id"] for h in rec["hits"]], "top_score": rec["top_score"]})]
    hits = [tools.Hit(**{k: h[k] for k in ("chunk_id", "doc_id", "text", "lang", "title", "publisher", "url")}, facts=h["facts"])
            for h in rec["hits"]]
    decision = aggregate(state)
    question = (f"HỒ SƠ: {fields.describe_profile(profile)}\nKẾT QUẢ ƯỚC LƯỢNG (mô hình): {risk['label_name']}\n"
                f"{decision_text(decision, state.get('rules', []))}\n"
                "Hãy đưa 3 đến 6 lời khuyên cụ thể cho người này, mỗi ý có trích dẫn. "
                "Nếu có luật sàng lọc kích hoạt, ưu tiên khuyên đi xét nghiệm.")
    offset, fallback = len(state.get("sources", [])), None
    try:
        ensure_llm(state)
        messages = gen.build_messages(question, hits)
        messages[0]["content"] = ADVISOR_SYSTEM
        reply = gen.client().chat.completions.create(model=gen.settings().model_name, messages=messages, temperature=0.1, max_tokens=900)
        gated = gen.gate(reply.choices[0].message.content or "", len(hits))
        state_name, text, used = gated.state.value, gated.text, len(gated.used)
    except Exception as e:  # LLM down or generation failed: list the graph's own recommendations instead
        if not isinstance(e, LLMUnavailable):
            calls.append(call("advisor_llm", {"query": query}, {"error": f"{type(e).__name__}: {e}"}))
        fallback = "graph_facts"
        lines = graph_fact_lines(rec["hits"])
        state_name, text, used = ("answered", "\n".join([FACTS_INTRO, *lines]), len(lines)) if lines else ("", "", 0)
    if state_name == "answered":
        section = {"kind": "advice", "title": "Lời khuyên", "text": offset_citations(text, offset)}
        summary = f"Dự phòng: {used} khuyến nghị từ đồ thị tri thức, không dùng LLM" if fallback else f"Lời khuyên với {used} trích dẫn"
    else:
        section = {"kind": "advice", "title": "Lời khuyên",
                   "text": "Chưa tìm được khuyến nghị có nguồn phù hợp. Anh/chị nên trao đổi với bác sĩ để được tư vấn và xét nghiệm."}
        summary = "Dự phòng: không có khuyến nghị trong đồ thị" if fallback else "Không có lời khuyên qua được cổng trích dẫn"
    decision["evidence"] = [*decision["evidence"], *(h.get("chunk_id") for h in rec["hits"])]
    return ({"sources": [*state.get("sources", []), *rec["hits"]], "sections": [*state.get("sections", []), section],
             "decision": decision}, summary, calls, fallback)


# ------------------------------------------------------------------ safety (out)

FILTERED = {"conclusion", "advice"}


@traced(Agent.SAFETY_OUT)
def safety_out(state: SessionState):
    flags, sections = list(state.get("safety_flags", [])), []
    for s in state.get("sections", []):
        if s["kind"] in FILTERED:
            text, raised = safety.filter_text(s["text"])
            flags += raised
            if not gen.CITE.search(text):
                flags.append("no_citation_left")
                text = "Nội dung bị loại ở bước kiểm an toàn. Anh/chị nên hỏi trực tiếp bác sĩ về vấn đề này."
            s = {**s, "text": text}
        sections.append(s)
    if "dosage_removed" in flags:
        sections.append({"kind": "notice", "title": "Về liều thuốc", "text": safety.DOSAGE_NOTICE})
    flags = sorted(set(flags))
    plain = "\n\n".join(s["text"] for s in sections)
    history = [*state.get("history", []), {"user": state["message"], "assistant": plain}][-10:]
    summary = f"Đã kiểm {sum(s['kind'] in FILTERED for s in sections)} phần do LLM viết" + (f"; cờ: {', '.join(flags)}" if flags else "")
    return {"sections": sections, "safety_flags": flags, "history": history}, summary, []


# ------------------------------------------------------------------ monitoring / audit

AUDIT_LOG = ROOT / "results" / "audit.jsonl"


def audit_record(state: SessionState) -> dict:
    """Execution metadata only: no message text and no profile values, just which fields were known."""
    trace = state.get("trace", [])
    return {
        "ts": datetime.now(UTC).isoformat(timespec="seconds"),
        "request_id": state.get("request_id", ""),
        "conversation_id": state.get("conversation_id", ""),
        "intent": state.get("intent", ""),
        "message_chars": len(state.get("message", "")),
        "profile_fields": sorted(state.get("profile", {})),
        "steps": [{k: st.get(k) for k in ("agent", "status", "ms", "version", "fallback", "evidence")} for st in trace],
        "decision": state.get("decision"),
        "safety_flags": state.get("safety_flags", []),
        "sources": len(state.get("sources", [])),
        "total_ms": sum(st.get("ms", 0) for st in trace),
        "llm_down_simulated": bool(state.get("llm_down")),
    }


@traced(Agent.AUDIT)
def audit(state: SessionState):
    rec = audit_record(state)
    try:
        AUDIT_LOG.parent.mkdir(parents=True, exist_ok=True)
        with AUDIT_LOG.open("a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False, default=str) + "\n")
        where = "đã ghi"
    except OSError as e:  # auditing must never break the answer
        where = f"không ghi được ({type(e).__name__})"
    fallbacks = sum(st["status"] == "fallback" for st in rec["steps"])
    summary = f"Nhật ký {where}: {len(rec['steps'])} bước, {fallbacks} dự phòng, {rec['total_ms']} ms"
    return {}, summary, [call("write_audit", {"request_id": rec["request_id"]}, {"steps": len(rec["steps"])})]
