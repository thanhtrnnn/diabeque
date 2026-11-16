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
    RULES = "rules"
    KNOWLEDGE = "knowledge"
    ADVISOR = "advisor"
    SAFETY_OUT = "safety_out"
    AUDIT = "audit"


AGENT_LABELS: dict[Agent, str] = {
    Agent.SAFETY_IN: "An toàn (vào)",
    Agent.ORCHESTRATOR: "Điều phối",
    Agent.INTAKE: "Thu thập thông tin",
    Agent.RISK: "Dự đoán nguy cơ",
    Agent.RULES: "Luật sàng lọc",
    Agent.KNOWLEDGE: "Tra cứu tri thức",
    Agent.ADVISOR: "Tư vấn",
    Agent.SAFETY_OUT: "An toàn (ra)",
    Agent.AUDIT: "Giám sát",
}


class CodeRef(TypedDict):
    path: str   # relative to the repo root, POSIX separators
    line: int   # the `def` line


class ToolCall(TypedDict, total=False):
    name: str
    args: dict[str, Any]
    result: Any
    code: CodeRef   # absent for names that are not in tools.BY_NAME


class Step(TypedDict, total=False):
    agent: str
    label: str
    summary: str
    tools: list[ToolCall]
    ms: int
    code: CodeRef           # where the node function is defined
    fallback: str | None    # "rules" when the LLM path failed and regex rules answered instead
    # Agent message contract (architecture §6.1: id, agent, status, payload, evidence, version).
    request_id: str
    status: str             # ok | fallback
    version: str            # model / ruleset / code version that produced the step
    evidence: list[str]     # chunk ids or rule ids the step relied on


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
    request_id: str
    conversation_id: str
    labs: dict[str, float]             # HbA1c / fasting glucose typed by the user (persisted)
    rules: list[dict[str, Any]]        # rule agent results of this turn
    decision: dict[str, Any] | None    # coordinator aggregate: prediction, rules and evidence kept apart
    llm_down: bool                     # simulated outage: LLM-backed agents must use their rules
    history: list[dict[str, str]]
    intent: str
    emergency: bool
    missing: list[str]
    sources: list[dict[str, Any]]      # retrieved chunks; citation S{i+1} points at sources[i]
    sections: list[Section]
    safety_flags: list[str]
    trace: list[Step]                  # steps of this turn, in order


TURN_DEFAULTS: dict[str, Any] = {
    "intent": "", "request_id": "", "conversation_id": "", "rules": [], "decision": None, "llm_down": False, "emergency": False, "missing": [], "sources": [], "sections": [], "safety_flags": [], "trace": [],
}
