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


def test_passages_with_dose_in_last_sentence_keep_citation_through_safety(offline, monkeypatch):
    dosed = {**HIT, "text": "Metformin giúp giảm đường huyết. Liều khởi đầu 500 mg mỗi ngày"}
    monkeypatch.setattr(tools, "search_knowledge", boom)
    monkeypatch.setattr(tools, "search_passages", lambda q, topic=None, k=3: {"hits": [dosed], "top_score": .9, "topic": None})
    out = run(offline, "HbA1c là gì")
    text = out["sections"][0]["text"]
    assert out["sections"][0]["title"] == "Đoạn tài liệu liên quan"
    assert "no_citation_left" not in out["safety_flags"]
    assert "Metformin giúp giảm đường huyết. [[cite:S1]]" in text and "500 mg" not in text


def test_passage_with_only_dose_text_is_skipped():
    assert nodes.passage_line("Uống 500 mg mỗi ngày.", 1) is None
    assert nodes.passage_line("Ăn nhiều rau.", 2) == "- Ăn nhiều rau. [[cite:S2]]"


# ------------------------------------------------------------------ advisor


FIRST_TURN = "Tôi 52 tuổi, nam, cao 1m65 nặng 80kg, bị huyết áp cao. Tôi có nguy cơ không?"
SECOND_TURN = "mỡ máu không, ít vận động, sức khỏe trung bình"
DOCTOR_TEXT = "Chưa tìm được khuyến nghị có nguồn phù hợp. Anh/chị nên trao đổi với bác sĩ"


def advisor_run(offline, monkeypatch, facts_by_hit):
    """Two-turn risk flow (as test_graph_multi_turn_intake_then_risk) with the advisor's LLM call failing."""
    hits = [{**HIT, "chunk_id": f"c{i}", "facts": f} for i, f in enumerate(facts_by_hit, 1)]
    monkeypatch.setattr(tools, "get_recommendations", lambda q, topic=None, k=5: {"hits": hits, "top_score": .9, "topic": topic})

    def fail(**kw):
        raise ConnectionError("llm endpoint down")

    monkeypatch.setattr(nodes.gen, "client", lambda: type("Cl", (), {"chat": type("Ch", (), {"completions": type("Co", (), {
        "create": staticmethod(fail)})()})()})())
    run(offline, FIRST_TURN)
    out = run(offline, SECOND_TURN)
    step = next(s for s in out["trace"] if s["agent"] == "advisor")
    return out, step, next(s for s in out["sections"] if s["kind"] == "advice")


def test_advisor_falls_back_to_graph_facts(offline, monkeypatch):
    out, step, advice = advisor_run(offline, monkeypatch, [["Tập thể dục 150 phút mỗi tuần", "Giảm cân 5-7%"]])
    assert step["fallback"] == "graph_facts"
    text = advice["text"]
    assert text.startswith("Không tạo được lời khuyên riêng lúc này; dưới đây là các khuyến nghị trong kho tài liệu.")
    assert "Tập thể dục 150 phút mỗi tuần" in text and "Giảm cân 5-7%" in text and "[[cite:S" in text


def test_advisor_facts_are_deduplicated_capped_and_cite_their_hit(offline, monkeypatch):
    facts = [["A một", "B hai", "A một"], ["C ba", "B hai", "D bốn"], ["E năm", "F sáu", "G bảy"]]
    out, step, advice = advisor_run(offline, monkeypatch, facts)
    bullets = [ln for ln in advice["text"].splitlines() if ln.startswith("- ")]
    assert [b.split(" [[")[0] for b in bullets] == ["- A một", "- B hai", "- C ba", "- D bốn", "- E năm", "- F sáu"]
    assert [b.rsplit("[[cite:S", 1)[1] for b in bullets] == ["1]]", "1]]", "2]]", "2]]", "3]]", "3]]"]


def test_advisor_fact_with_dose_is_dropped_and_others_keep_citation(offline, monkeypatch):
    out, step, advice = advisor_run(offline, monkeypatch, [["Uống metformin 500 mg mỗi ngày", "Giảm cân 5-7%", "Ăn nhiều rau"]])
    text = advice["text"]
    assert step["fallback"] == "graph_facts" and "no_citation_left" not in out["safety_flags"]
    assert "500 mg" not in text and "metformin" not in text.lower()
    assert "Giảm cân 5-7%" in text and "Ăn nhiều rau" in text and text.count("[[cite:S") == 2


def test_advisor_without_facts_keeps_doctor_message(offline, monkeypatch):
    """Checked on the node's own output: the cite-less doctor message is what safety_out later replaces (as on the gate path)."""
    hits = [{**HIT, "facts": []}, {**HIT2, "facts": []}]
    monkeypatch.setattr(tools, "get_recommendations", lambda q, topic=None, k=5: {"hits": hits, "top_score": .9, "topic": topic})
    monkeypatch.setattr(nodes.gen, "client", lambda: pytest.fail("LLM must not be called"))
    state = {**TURN_DEFAULTS, "llm_down": True, "profile": {"BMI": 29.4}, "sources": [],
             "risk": {"label": 2, "task": "status3", "topic": "diabetes_general", "label_name": "x"}}
    update = nodes.advisor(state)
    advice = update["sections"][0]
    assert update["trace"][-1]["fallback"] == "graph_facts"
    assert advice["text"].startswith(DOCTOR_TEXT) and "[[cite:S" not in advice["text"]
    assert [s["chunk_id"] for s in update["sources"]] == ["c1", "c2"]


def test_advisor_no_fallback_when_llm_answers(offline):
    run(offline, FIRST_TURN)
    out = run(offline, SECOND_TURN)
    assert next(s for s in out["trace"] if s["agent"] == "advisor")["fallback"] is None


def test_advisor_llm_down_uses_graph_facts_without_calling_llm(offline, monkeypatch):
    hits = [{**HIT, "facts": ["Giảm cân 5-7%"]}]
    monkeypatch.setattr(tools, "get_recommendations", lambda q, topic=None, k=5: {"hits": hits, "top_score": .9, "topic": topic})
    monkeypatch.setattr(nodes.gen, "client", lambda: pytest.fail("LLM must not be called"))
    run(offline, FIRST_TURN)
    out = run(offline, SECOND_TURN, llm_down=True)
    assert next(s for s in out["trace"] if s["agent"] == "advisor")["fallback"] == "graph_facts"
