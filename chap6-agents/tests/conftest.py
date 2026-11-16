"""Fixtures shared by the agent tests."""

import pytest

from backend.app.agents import graph, nodes, tools


@pytest.fixture(autouse=True)
def audit_to_tmp(monkeypatch, tmp_path):
    """No test run writes into results/audit.jsonl."""
    monkeypatch.setattr(nodes, "AUDIT_LOG", tmp_path / "audit.jsonl")


@pytest.fixture
def offline(monkeypatch):
    def no_llm(schema):
        raise ConnectionError("offline")

    monkeypatch.setattr(nodes, "structured", no_llm)
    monkeypatch.setattr(tools, "predict_diabetes_risk", lambda f: {
        "task": "status3", "label": 2, "label_name": "Báo cáo mắc đái tháo đường", "probs": {"0": .2, "1": .3, "2": .5},
        "probs_population": {"0": .7, "1": .05, "2": .25}, "topic": "diabetes_general", "model": "mlp", "defaulted": []})
    hit = {"chunk_id": "c1", "doc_id": "d1", "title": "T", "publisher": "P", "lang": "vi", "url": "u", "text": "x",
           "score": 1.0, "retrieved_by": ["vector"], "facts": []}
    monkeypatch.setattr(tools, "get_recommendations", lambda q, topic=None, k=5: {"hits": [hit], "top_score": .9, "topic": topic})
    monkeypatch.setattr(tools, "search_knowledge", lambda q, topic=None: {
        "state": "answered", "text": "Khát nhiều [[cite:S1]].", "hits": [hit], "used": ["S1"], "top_score": .9})
    monkeypatch.setattr(tools, "search_passages", lambda q, topic=None, k=3: {"hits": [hit], "top_score": .9, "topic": topic})

    class Reply:
        choices = [type("C", (), {"message": type("M", (), {"content": "Đi bộ 30 phút mỗi ngày [[cite:S1]]. Dùng thuốc 500 mg."})()})()]

    monkeypatch.setattr(nodes.gen, "client", lambda: type("Cl", (), {"chat": type("Ch", (), {"completions": type("Co", (), {
        "create": staticmethod(lambda **kw: Reply())})()})()})())
    return graph.build(graph.InMemorySaver())


@pytest.fixture
def offline_llm_ok(offline, monkeypatch):
    """Like `offline`, but the LLM `structured` call answers with valid objects instead of raising."""
    answers = {"IntentDecision": nodes.IntentDecision(intent="knowledge", reason="câu hỏi kiến thức"),
               "IntakeExtraction": nodes.IntakeExtraction()}
    monkeypatch.setattr(nodes, "structured", lambda schema: type("Llm", (), {
        "invoke": staticmethod(lambda prompt: answers[schema.__name__])})())
    return offline
