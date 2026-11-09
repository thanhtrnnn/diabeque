"""Tools the agents call. Plain functions, also wrapped as LangChain tools for the single-agent baseline."""

import json
import math
import sqlite3
from functools import lru_cache
from pathlib import Path
from typing import Any

from langchain_core.tools import StructuredTool

from .. import answer as gen
from ..classify import FEATURE_NAMES, predict
from ..retrieval import Hit, retrieve
from ..schema import AnswerState, Task, Topic
from .fields import FIELD_BY_NAME, bmi

OUT_OF_SCOPE_MIN_COSINE = 0.78  # same threshold as A8


def compute_bmi(height_m: float, weight_kg: float) -> dict:
    """Tính chỉ số khối cơ thể BMI = cân nặng (kg) / chiều cao (m)^2. Chiều cao có thể nhập bằng m hoặc cm."""
    return {"bmi": bmi(height_m, weight_kg)}


def validate_profile(profile: dict[str, Any]) -> dict:
    """Giữ các đặc trưng BRFSS hợp lệ, trả về danh sách giá trị bị loại kèm lý do."""
    clean, rejected = {}, []
    for name, value in profile.items():
        field = FIELD_BY_NAME.get(name)
        if field is None:
            rejected.append({"field": name, "reason": "không phải đặc trưng của mô hình"})
            continue
        try:
            v = float(value)
        except (TypeError, ValueError):
            rejected.append({"field": name, "reason": f"không phải số: {value!r}"})
            continue
        if math.isnan(v) or not field["min"] <= v <= field["max"]:
            rejected.append({"field": name, "reason": f"{v:g} ngoài khoảng [{field['min']}, {field['max']}]"})
            continue
        clean[name] = v
    return {"profile": clean, "rejected": rejected}


SURVEY_DB = Path(__file__).resolve().parents[3] / "data" / "survey.db"
MODELS_DIR = Path(__file__).resolve().parents[3] / "models"


@lru_cache
def class_counts(task: Task) -> dict[str, int]:
    """Label counts of the survey data; falls back to models/<task>/class_counts.json (exported from survey.db) so the
    API runs without the 250 MB database. Empty when neither is present."""
    if not SURVEY_DB.exists():
        cached = MODELS_DIR / task.value / "class_counts.json"
        return json.loads(cached.read_text()) if cached.exists() else {}
    with sqlite3.connect(SURVEY_DB) as con:
        rows = con.execute("SELECT status, COUNT(*) FROM survey_records WHERE task = ? GROUP BY status", (task.value,)).fetchall()
    return {str(k): n for k, n in rows}


def prior_corrected(task: Task, probs: dict[str, float]) -> dict[str, float] | None:
    """Undo the class weights used in training: weight_c is proportional to 1 / n_c, so p_c * n_c restores the
    data's class frequencies. A8 measured ECE 0.088 -> 0.006 on the three-group test set with this correction."""
    counts = class_counts(task)
    if not counts:
        return None
    raw = {k: p * counts.get(k, 0) for k, p in probs.items()}
    total = sum(raw.values())
    return {k: round(v / total, 4) for k, v in raw.items()}


def _predict(task: Task, features: dict[str, float]) -> dict:
    out = predict(task, {k: v for k, v in features.items() if k in FEATURE_NAMES})
    probs = {str(k): round(v, 4) for k, v in out["probs"].items()}
    return {
        "task": task.value,
        "label": out["label"],
        "label_name": out["label_name"],
        "probs": probs,                                      # calibrated, class-weighted: screening view
        "probs_population": prior_corrected(task, probs),    # class frequencies restored: what to show users
        "topic": str(out["topic"]),
        "model": out["model"],
        "defaulted": [n for n in FEATURE_NAMES if n not in features],
    }


def predict_diabetes_risk(features: dict[str, float]) -> dict:
    """Ước lượng xác suất ba nhóm (0 không báo cáo mắc, 1 tiền đái tháo đường, 2 đái tháo đường) từ đặc trưng BRFSS."""
    return _predict(Task.STATUS3, features)


def predict_diabetes_type(features: dict[str, float]) -> dict:
    """Chỉ dùng cho người đã được chẩn đoán: ước lượng Type 1 hay Type 2 từ đặc trưng BRFSS."""
    return _predict(Task.DIABTYPE, features)


def hit_record(h: Hit) -> dict:
    return {"chunk_id": h.chunk_id, "doc_id": h.doc_id, "title": h.title, "publisher": h.publisher, "lang": h.lang,
            "url": h.url, "text": h.text, "score": round(h.score, 5), "retrieved_by": h.retrieved_by, "facts": h.facts}


def get_recommendations(query: str, topic: str | None = None, k: int = 5) -> dict:
    """Tìm các đoạn tài liệu có khuyến nghị liên quan trong kho KB_diabet (không sinh câu trả lời)."""
    r = retrieve(query, Topic(topic) if topic else None, k=k)
    return {"hits": [hit_record(h) for h in r.hits], "top_score": round(r.top_vector_score, 4), "topic": r.topic}


def search_knowledge(question: str, topic: str | None = None) -> dict:
    """Trả lời câu hỏi kiến thức bằng pipeline RAG của A8: truy xuất, sinh, kiểm trích dẫn.

    Citations in `text` are [[cite:Sn]], n indexing `hits`."""
    r = retrieve(question, Topic(topic) if topic else None)
    if r.top_vector_score < OUT_OF_SCOPE_MIN_COSINE or not r.hits:
        return {"state": AnswerState.OUT_OF_SCOPE.value, "text": "", "hits": [], "top_score": round(r.top_vector_score, 4)}
    raw = "".join(gen.stream_answer(question, r.hits))
    gated = gen.gate(raw, len(r.hits))
    return {"state": gated.state.value, "text": gated.text, "hits": [hit_record(h) for h in r.hits],
            "used": gated.used, "top_score": round(r.top_vector_score, 4), "topic": r.topic}


FUNCTIONS = [compute_bmi, validate_profile, predict_diabetes_risk, predict_diabetes_type, get_recommendations, search_knowledge]
LC_TOOLS = [StructuredTool.from_function(f) for f in FUNCTIONS]
