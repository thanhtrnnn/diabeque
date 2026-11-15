"""Trace steps carry where the code lives (for the factory view) and whether the LLM path fell back to rules."""

import functools
from pathlib import Path

import pytest

from backend.app.agents import nodes, tools
from backend.app.agents.coderef import code_ref
from backend.app.agents.state import TURN_DEFAULTS

REPO_ROOT = Path(__file__).resolve().parents[2]


def run(g, msg, tid="t", **extra):
    return g.invoke({**TURN_DEFAULTS, "message": msg, **extra}, {"configurable": {"thread_id": tid}})


def test_step_has_code_of_node_definition(offline):
    out = run(offline, "HbA1c là gì")
    step = out["trace"][0]
    assert step["code"]["path"] == "chap6-agents/backend/app/agents/nodes.py"
    src = Path(REPO_ROOT, step["code"]["path"]).read_text().splitlines()
    assert src[step["code"]["line"] - 1].startswith("def safety_in(")


def test_tool_call_carries_code(offline):
    first = run(offline, "Tôi 52 tuổi, nam, cao 1m65 nặng 80kg, bị huyết áp cao. Tôi có nguy cơ không?")
    calls = {c["name"]: c for s in first["trace"] for c in s["tools"]}
    assert calls["compute_bmi"]["code"]["path"].endswith("agents/tools.py")


def test_rules_fallback_flagged_when_llm_fails(offline):
    out = run(offline, "HbA1c là gì")
    by_agent = {s["agent"]: s for s in out["trace"]}
    assert by_agent["orchestrator"]["fallback"] == "rules"
    assert by_agent["safety_in"]["fallback"] is None


def test_intake_fallback_flagged_when_extraction_fails(offline):
    first = run(offline, "Tôi 52 tuổi, nam, cao 1m65 nặng 80kg, bị huyết áp cao. Tôi có nguy cơ không?")
    assert {s["agent"]: s["fallback"] for s in first["trace"]}["intake"] == "rules"


def test_no_fallback_when_llm_answers(offline, monkeypatch):
    decision = nodes.IntentDecision(intent="knowledge", reason="câu hỏi kiến thức")
    monkeypatch.setattr(nodes, "structured", lambda schema: type("Llm", (), {"invoke": staticmethod(lambda prompt: decision)})())
    out = run(offline, "HbA1c là gì")
    assert {s["agent"]: s["fallback"] for s in out["trace"]}["orchestrator"] is None


def test_call_omits_code_for_unknown_tool():
    assert "code" not in nodes.call("not_a_tool", {}, None)
    assert nodes.call("compute_bmi", {}, None)["code"]["path"] == "chap6-agents/backend/app/agents/tools.py"


def test_code_ref_points_at_def_line_through_decorators():
    def decorate(f):
        @functools.wraps(f)
        def inner(*args):
            return f(*args)

        return inner

    @decorate
    @decorate
    def target():
        pass

    ref = code_ref(target)
    assert Path(REPO_ROOT, ref["path"]) == Path(__file__).resolve()
    assert Path(__file__).read_text().splitlines()[ref["line"] - 1].strip() == "def target():"


def test_llm_down_forces_rules(offline_llm_ok):
    out = run(offline_llm_ok, "HbA1c là gì", llm_down=True)
    assert next(s for s in out["trace"] if s["agent"] == "orchestrator")["fallback"] == "rules"


def test_llm_down_off_keeps_llm_path(offline_llm_ok):
    out = run(offline_llm_ok, "HbA1c là gì")
    assert next(s for s in out["trace"] if s["agent"] == "orchestrator")["fallback"] is None


def test_llm_down_forces_rules_in_intake(offline_llm_ok):
    out = run(offline_llm_ok, "Tôi 52 tuổi, nam, cao 1m65 nặng 80kg, bị huyết áp cao. Tôi có nguy cơ không?", llm_down=True)
    assert {s["agent"]: s["fallback"] for s in out["trace"]}["intake"] == "rules"


def test_node_exception_tagged(offline, monkeypatch):
    monkeypatch.setattr(tools, "search_knowledge", lambda q, topic=None: (_ for _ in ()).throw(RuntimeError("neo4j")))
    monkeypatch.setattr(tools, "search_passages", lambda q, topic=None, k=3: (_ for _ in ()).throw(RuntimeError("neo4j")))
    with pytest.raises(RuntimeError) as e:
        run(offline, "HbA1c là gì")
    assert e.value.diabeque_node == "knowledge"
