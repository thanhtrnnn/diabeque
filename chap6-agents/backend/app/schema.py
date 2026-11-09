"""Single source of truth for the KB_diabet graph, topics, answer states and SSE events."""

from enum import StrEnum

KB_ID = "KB_diabet"
EMBEDDING_DIM = 1024
VECTOR_INDEX = "chunk_embedding"


class Label(StrEnum):
    DOCUMENT = "Document"
    CHUNK = "Chunk"
    DISEASE = "Disease"
    SYMPTOM = "Symptom"
    COMPLICATION = "Complication"
    RISK_FACTOR = "RiskFactor"
    RECOMMENDATION = "Recommendation"
    DRUG_CLASS = "DrugClass"
    SURVEY_RECORD = "SurveyRecord"
    SURVEY_STATUS = "SurveyStatus"


class Rel(StrEnum):
    PART_OF = "PART_OF"
    HAS_SYMPTOM = "HAS_SYMPTOM"
    HAS_COMPLICATION = "HAS_COMPLICATION"
    HAS_RISK_FACTOR = "HAS_RISK_FACTOR"
    HAS_RECOMMENDATION = "HAS_RECOMMENDATION"
    HAS_DRUG_CLASS = "HAS_DRUG_CLASS"
    SUPPORTED_BY = "SUPPORTED_BY"
    HAS_REPORTED_STATUS = "HAS_REPORTED_STATUS"


# Fact kind produced by extraction -> (node label, relation from Disease).
FACT_KINDS: dict[str, tuple[Label, Rel]] = {
    "symptom": (Label.SYMPTOM, Rel.HAS_SYMPTOM),
    "complication": (Label.COMPLICATION, Rel.HAS_COMPLICATION),
    "risk_factor": (Label.RISK_FACTOR, Rel.HAS_RISK_FACTOR),
    "recommendation": (Label.RECOMMENDATION, Rel.HAS_RECOMMENDATION),
    "drug_class": (Label.DRUG_CLASS, Rel.HAS_DRUG_CLASS),
}


class Topic(StrEnum):
    PREVENTION = "prevention"
    PREDIABETES = "prediabetes"
    DIABETES_GENERAL = "diabetes_general"
    TYPE1 = "type1"
    TYPE2 = "type2"


DISEASES: dict[str, dict[str, str]] = {
    "dtd_chung": {"name_vi": "Đái tháo đường", "name_en": "Diabetes"},
    "tien_dtd": {"name_vi": "Tiền đái tháo đường", "name_en": "Prediabetes"},
    "dtd_type1": {"name_vi": "Đái tháo đường type 1", "name_en": "Type 1 diabetes"},
    "dtd_type2": {"name_vi": "Đái tháo đường type 2", "name_en": "Type 2 diabetes"},
    "dtd_thai_ky": {"name_vi": "Đái tháo đường thai kỳ", "name_en": "Gestational diabetes"},
}

TOPIC_DISEASE: dict[Topic, str] = {
    Topic.PREVENTION: "dtd_chung",
    Topic.PREDIABETES: "tien_dtd",
    Topic.DIABETES_GENERAL: "dtd_chung",
    Topic.TYPE1: "dtd_type1",
    Topic.TYPE2: "dtd_type2",
}


class Task(StrEnum):
    STATUS3 = "status3"
    DIABTYPE = "diabtype"


# (task, predicted label) -> topic. Every label a classifier can emit must appear here.
LABEL_TOPIC: dict[tuple[Task, int], Topic] = {
    (Task.STATUS3, 0): Topic.PREVENTION,
    (Task.STATUS3, 1): Topic.PREDIABETES,
    (Task.STATUS3, 2): Topic.DIABETES_GENERAL,
    (Task.DIABTYPE, 1): Topic.TYPE1,
    (Task.DIABTYPE, 2): Topic.TYPE2,
}

LABEL_NAMES: dict[tuple[Task, int], str] = {
    (Task.STATUS3, 0): "Không báo cáo mắc bệnh",
    (Task.STATUS3, 1): "Tiền đái tháo đường",
    (Task.STATUS3, 2): "Báo cáo mắc đái tháo đường",
    (Task.DIABTYPE, 1): "Type 1",
    (Task.DIABTYPE, 2): "Type 2",
}


class AnswerState(StrEnum):
    ANSWERED = "answered"
    INSUFFICIENT_EVIDENCE = "insufficient_evidence"
    OUT_OF_SCOPE = "out_of_scope"


# Subset of P-185 chat stream v1, so the copied frontend parser/reducer keep working.
SSE_EVENTS = (
    "stream.started",
    "sources.snapshot",
    "answer.started",
    "answer.section.started",
    "answer.text.delta",
    "answer.citation",
    "answer.section.completed",
    "answer.final",
    "stream.completed",
    "stream.error",
)

DISCLAIMER = (
    "Thông tin chỉ để tham khảo, tổng hợp từ nguồn y tế công khai. "
    "Không thay thế chẩn đoán hay chỉ định điều trị của bác sĩ."
)
