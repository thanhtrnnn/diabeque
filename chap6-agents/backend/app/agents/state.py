"""Shared session state. Every agent reads and writes this one object; LangGraph checkpoints it per conversation."""

from enum import StrEnum
from typing import Any, TypedDict


class Intent(StrEnum):
    KNOWLEDGE = "knowledge"      # câu hỏi kiến thức về đái tháo đường
    ASSESS_RISK = "assess_risk"  # muốn ước lượng nguy cơ / được tư vấn theo hồ sơ
    GREETING = "greeting"        # chào hỏi, hỏi hệ thống làm được gì
    OUT_OF_SCOPE = "out_of_scope"


class Agent(StrEnum):
    SAFETY_IN = "safety_in"
    ORCHESTRATOR = "orchestrator"
    INTAKE = "intake"
    RISK = "risk"
    KNOWLEDGE = "knowledge"
    ADVISOR = "advisor"
    SAFETY_OUT = "safety_out"


AGENT_LABELS: dict[Agent, str] = {
    Agent.SAFETY_IN: "An toàn (vào)",
    Agent.ORCHESTRATOR: "Điều phối",
    Agent.INTAKE: "Thu thập thông tin",
    Agent.RISK: "Dự đoán nguy cơ",
    Agent.KNOWLEDGE: "Tra cứu tri thức",
    Agent.ADVISOR: "Tư vấn",
    Agent.SAFETY_OUT: "An toàn (ra)",
}


class Step(TypedDict, total=False):
    agent: str
    label: str
    summary: str
    tools: list[dict[str, Any]]
    ms: int


class Section(TypedDict):
    kind: str   # risk | conclusion | advice | question | notice | emergency
    title: str
    text: str   # may contain [[cite:Sn]] markers, n indexes `sources`


class SessionState(TypedDict, total=False):
    # Persisted across turns of one conversation (checkpointed).
    profile: dict[str, float]          # BRFSS features collected so far
    diagnosed: bool | None             # user says a doctor told them they have diabetes
    awaiting_intake: bool              # last reply was an intake question
    asked: list[str]                   # fields already asked about, so we do not ask twice
    risk: dict[str, Any] | None
    # Per turn (reset by the API before each run).
    message: str
    history: list[dict[str, str]]
    intent: str
    emergency: bool
    missing: list[str]
    sources: list[dict[str, Any]]      # retrieved chunks; citation S{i+1} points at sources[i]
    sections: list[Section]
    safety_flags: list[str]
    trace: list[Step]                  # steps of this turn, in order


TURN_DEFAULTS: dict[str, Any] = {
    "intent": "", "emergency": False, "missing": [], "sources": [], "sections": [], "safety_flags": [], "trace": [],
}
