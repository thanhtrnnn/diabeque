"""Knowledge falls back to cited passages (no LLM) when answer generation fails or the LLM is down."""

import pytest

from backend.app.agents import nodes, tools
from backend.app.agents.state import TURN_DEFAULTS
from backend.app.retrieval import Hit, Retrieval

LONG = ("Đái tháo đường là bệnh mạn tính " * 20).strip()
HIT = {"chunk_id": "c1", "doc_id": "d1", "title": "T1", "publisher": "P", "lang": "vi", "url": "u1", "text": "HbA1c phản ánh đường huyết trung bình 3 tháng.",
       "score": 0.9, "retrieved_by": ["vector"], "facts": []}
HIT2 = {**HIT, "chunk_id": "c2", "doc_id": "d2", "text": LONG}


def run(g, msg, tid="t", **extra):
    return g.invoke({**TURN_DEFAULTS, "message": msg, "llm_down": False, **extra}, {"configurable": {"thread_id": tid}})


def boom(q, topic=None):
    raise ConnectionError("llm endpoint down")


@pytest.fixture
def passages(offline, monkeypatch):
    monkeypatch.setattr(tools, "search_passages", lambda q, topic=None, k=3: {"hits": [HIT, HIT2], "top_score": .9, "topic": None})
    return offline


def test_knowledge_falls_back_to_passages(passages, monkeypatch):
    monkeypatch.setattr(tools, "search_knowledge", boom)
    out = run(passages, "HbA1c là gì")
    step = next(s for s in out["trace"] if s["agent"] == "knowledge")
    assert step["fallback"] == "passages"
    assert [c["name"] for c in step["tools"]] == ["search_knowledge", "search_passages"]
    section = out["sections"][0]
    assert section["title"] == "Đoạn tài liệu liên quan"
    text = section["text"]
    assert text.startswith("Không tạo được câu trả lời") and "[[cite:S1]]" in text and "[[cite:S2]]" in text
    assert [s["chunk_id"] for s in out["sources"]] == ["c1", "c2"]


def test_passages_are_cut_at_a_word_within_280_chars(passages, monkeypatch):
    monkeypatch.setattr(tools, "search_knowledge", boom)
    line = run(passages, "HbA1c là gì")["sections"][0]["text"].splitlines()[2]
    body = line.removeprefix("- ").removesuffix(" [[cite:S2]]")
    assert line.startswith("- ") and len(body) <= 280 and LONG.startswith(body) and LONG[len(body)] == " "


def test_knowledge_passages_survive_safety_out(passages, monkeypatch):
    monkeypatch.setattr(tools, "search_knowledge", boom)
    out = run(passages, "HbA1c là gì")
    assert "no_citation_left" not in out["safety_flags"]
    assert "[[cite:S1]]" in out["sections"][0]["text"]


def test_llm_down_uses_passages_without_calling_search_knowledge(passages, monkeypatch):
    called = []
    monkeypatch.setattr(tools, "search_knowledge", lambda q, topic=None: called.append(q))
    out = run(passages, "HbA1c là gì", llm_down=True)
    assert called == []
    assert next(s for s in out["trace"] if s["agent"] == "knowledge")["fallback"] == "passages"


def test_empty_passages_give_out_of_scope_notice(offline, monkeypatch):
    monkeypatch.setattr(tools, "search_knowledge", boom)
    monkeypatch.setattr(tools, "search_passages", lambda q, topic=None, k=3: {"hits": [], "top_score": .2, "topic": None})
    out = run(offline, "thời tiết hôm nay")
    assert out["sections"][0]["title"] == "Ngoài phạm vi" and out["sections"][0]["text"] == nodes.OUT_OF_SCOPE_TEXT
    assert next(s for s in out["trace"] if s["agent"] == "knowledge")["fallback"] == "passages"


def test_no_fallback_when_answer_generated(offline):
    out = run(offline, "HbA1c là gì")
    assert next(s for s in out["trace"] if s["agent"] == "knowledge")["fallback"] is None


def _retrieval(score, hits=(1,)):
    pool = [Hit(chunk_id=f"c{i}", doc_id="d", text="văn bản", lang="vi", title="T", publisher="P", url="u") for i in hits]
    return Retrieval(pool, None, score)


def test_search_passages_retrieves_without_llm(monkeypatch):
    seen = {}
    monkeypatch.setattr(tools, "retrieve", lambda q, topic=None, k=5: seen.update(k=k) or _retrieval(0.9))
    monkeypatch.setattr(tools.gen, "stream_answer", lambda *a: pytest.fail("LLM must not be called"))
    out = tools.search_passages("HbA1c là gì")
    assert seen["k"] == 3 and [h["chunk_id"] for h in out["hits"]] == ["c1"] and out["top_score"] == 0.9


def test_search_passages_out_of_scope_returns_no_hits(monkeypatch):
    monkeypatch.setattr(tools, "retrieve", lambda q, topic=None, k=5: _retrieval(0.5))
    assert tools.search_passages("thời tiết")["hits"] == []
    assert tools.search_knowledge("thời tiết")["state"] == "out_of_scope"


def test_search_passages_has_code_ref():
    assert nodes.call("search_passages", {}, None)["code"]["path"].endswith("agents/tools.py")
