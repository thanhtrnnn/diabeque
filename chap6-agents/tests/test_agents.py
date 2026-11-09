"""Agent logic that does not need the LLM or Neo4j: safety rules, intake parsing, routing, tools, a stubbed full graph."""

import pytest

from backend.app.agents import fields, graph, nodes, safety, tools
from backend.app.agents.state import TURN_DEFAULTS, Agent, Intent
from backend.app.schema import Task


# ---------------------------------------------------------------- safety


@pytest.mark.parametrize("msg", [
    "Tôi thấy lú lẫn, vã mồ hôi sau khi tiêm insulin",
    "bố tôi bất tỉnh, có tiểu đường",
    "đường huyết đo được 450 mg/dl, khó thở",
    "đường huyết 2.8 mmol/L",
    "hơi thở có mùi trái cây và nôn nhiều",
])
def test_emergency_detected(msg):
    assert safety.is_emergency(msg)


@pytest.mark.parametrize("msg", [
    "đường huyết lúc đói 6.5 mmol/L có sao không",
    "đường huyết 126 mg/dl là bị tiểu đường chưa",
    "triệu chứng tiểu đường type 2",
    "tôi sống ở Việt Nam, 40 tuổi",
])
def test_no_false_emergency(msg):
    assert not safety.is_emergency(msg)


def test_filter_removes_dose_and_diagnosis_keeps_rest():
    text = ("- Ăn nhiều rau [[cite:S1]]. Uống metformin 500 mg mỗi ngày.\n"
            "- Bạn chắc chắn bị đái tháo đường type 2.\n"
            "- Nếu bạn có tiền đái tháo đường, hãy giảm 5-10% cân nặng [[cite:S2]].")
    out, flags = safety.filter_text(text)
    assert "500 mg" not in out and "chắc chắn" not in out
    assert "Ăn nhiều rau [[cite:S1]]." in out and "Nếu bạn có tiền đái tháo đường" in out
    assert out.startswith("- ")
    assert flags == ["diagnosis_removed", "dosage_removed"]


def test_filter_removes_dose_split_without_unit():
    out, flags = safety.filter_text("- Liều phân bổ là 2/3 tổng liều vào buổi sáng [[cite:S1]].\n- Ăn nhiều rau [[cite:S2]].")
    assert "2/3" not in out and "Ăn nhiều rau" in out and flags == ["dosage_removed"]


def test_filter_keeps_glucose_threshold():
    out, flags = safety.filter_text("Đường huyết lúc đói từ 126 mg/dL trở lên là ngưỡng chẩn đoán [[cite:S1]].")
    assert flags == [] and "126 mg/dL" in out


# ---------------------------------------------------------------- intake


def test_age_group_and_bmi():
    assert fields.age_group(18) == 1 and fields.age_group(52) == 7 and fields.age_group(90) == 13
    assert fields.age_group(15) is None
    assert fields.bmi(1.65, 80) == 29.4 and fields.bmi(165, 80) == 29.4


def test_rule_extract_full_sentence():
    x = nodes.rule_extract("Tôi 45 tuổi, nữ, cao 1m58 nặng 68kg, mỡ máu cao, huyết áp bình thường, ít vận động, sức khỏe tốt.")
    assert (x.age_years, x.sex, x.height_m, x.weight_kg) == (45, "female", 1.58, 68)
    assert (x.high_chol, x.high_bp, x.phys_activity, x.gen_hlth) == (True, False, False, 3)


@pytest.mark.parametrize("msg,bp,chol", [
    ("huyết áp và mỡ máu bình thường", False, False),
    ("huyết áp cao và mỡ máu bình thường", True, False),
    ("không bị huyết áp cao", False, None),
    ("bị tăng huyết áp, mỡ máu thì không", True, False),
])
def test_rule_yes_no(msg, bp, chol):
    x = nodes.rule_extract(msg)
    assert (x.high_bp, x.high_chol) == (bp, chol)


def test_rule_activity():
    assert nodes.rule_extract("tập thể thao đều").phys_activity is True
    assert nodes.rule_extract("không tập thể dục").phys_activity is False


def test_sex_normalised():
    assert nodes.IntakeExtraction(sex="nam").sex == "male" and nodes.IntakeExtraction(sex="Nữ").sex == "female"


def test_rule_extract_ignores_viet_nam():
    assert nodes.rule_extract("tôi ở Việt Nam").sex is None


def test_merge_prefers_llm():
    llm = nodes.IntakeExtraction(high_bp=True)
    merged = nodes.merge(llm, nodes.IntakeExtraction(high_bp=False, age_years=40))
    assert merged.high_bp is True and merged.age_years == 40


def test_to_features_calls_bmi_tool():
    feats, calls = nodes.to_features(nodes.IntakeExtraction(age_years=52, sex="male", height_m=1.65, weight_kg=80, high_bp=True))
    assert feats == {"Age": 7, "Sex": 1, "BMI": 29.4, "HighBP": 1}
    assert calls[0]["name"] == "compute_bmi"


def test_validate_profile_rejects_out_of_range():
    out = tools.validate_profile({"BMI": 5, "Age": 7, "Foo": 1, "HighBP": "x"})
    assert out["profile"] == {"Age": 7.0}
    assert {r["field"] for r in out["rejected"]} == {"BMI", "Foo", "HighBP"}


# ---------------------------------------------------------------- routing and helpers


def test_routing():
    assert graph.after_safety_in({"emergency": True}) == Agent.SAFETY_OUT
    assert graph.after_safety_in({"emergency": False}) == Agent.ORCHESTRATOR
    assert graph.after_orchestrator({"intent": Intent.KNOWLEDGE}) == Agent.KNOWLEDGE
    assert graph.after_orchestrator({"intent": Intent.ASSESS_RISK}) == Agent.INTAKE
    assert graph.after_orchestrator({"intent": Intent.GREETING}) == Agent.SAFETY_OUT
    assert graph.after_intake({"missing": ["Sex"]}) == Agent.SAFETY_OUT
    assert graph.after_intake({"missing": []}) == Agent.RISK


def test_fallback_intent():
    assert nodes.fallback_intent({"message": "xin chào"}) == Intent.GREETING
    assert nodes.fallback_intent({"message": "tôi 50 tuổi có nguy cơ không"}) == Intent.ASSESS_RISK
    assert nodes.fallback_intent({"message": "có", "awaiting_intake": True}) == Intent.ASSESS_RISK
    assert nodes.fallback_intent({"message": "HbA1c là gì"}) == Intent.KNOWLEDGE


def test_offset_citations():
    assert nodes.offset_citations("a [[cite:S1]] b [[cite:S3]]", 5) == "a [[cite:S6]] b [[cite:S8]]"


def test_prior_correction_restores_frequencies(monkeypatch):
    monkeypatch.setattr(tools, "class_counts", lambda task: {"0": 900, "1": 20, "2": 80})
    out = tools.prior_corrected(Task.STATUS3, {"0": 0.2, "1": 0.3, "2": 0.5})
    assert abs(sum(out.values()) - 1) < 1e-3 and out["0"] > 0.7


# ---------------------------------------------------------------- full graph with stubs (no LLM, no Neo4j)


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

    class Reply:
        choices = [type("C", (), {"message": type("M", (), {"content": "Đi bộ 30 phút mỗi ngày [[cite:S1]]. Dùng thuốc 500 mg."})()})()]

    monkeypatch.setattr(nodes.gen, "client", lambda: type("Cl", (), {"chat": type("Ch", (), {"completions": type("Co", (), {
        "create": staticmethod(lambda **kw: Reply())})()})()})())
    return graph.build(graph.InMemorySaver())


def run(g, msg, tid="t"):
    return g.invoke({**TURN_DEFAULTS, "message": msg}, {"configurable": {"thread_id": tid}})


def test_graph_knowledge_turn(offline):
    out = run(offline, "HbA1c là gì")
    assert [s["agent"] for s in out["trace"]] == ["safety_in", "orchestrator", "knowledge", "safety_out"]
    assert out["sections"][0]["text"] == "Khát nhiều [[cite:S1]]."


def test_graph_multi_turn_intake_then_risk(offline):
    first = run(offline, "Tôi 52 tuổi, nam, cao 1m65 nặng 80kg, bị huyết áp cao. Tôi có nguy cơ không?")
    assert first["sections"][0]["kind"] == "question" and first["awaiting_intake"]
    assert set(first["missing"]) == {"HighChol", "PhysActivity", "GenHlth"}
    second = run(offline, "mỡ máu không, ít vận động, sức khỏe trung bình")
    agents = [s["agent"] for s in second["trace"]]
    assert agents == ["safety_in", "orchestrator", "intake", "risk", "advisor", "safety_out"]
    kinds = [s["kind"] for s in second["sections"]]
    assert kinds == ["risk", "advice", "notice"]
    advice = second["sections"][1]["text"]
    assert "500 mg" not in advice and "[[cite:S1]]" in advice
    assert "dosage_removed" in second["safety_flags"]


def test_graph_emergency_short_circuits(offline):
    out = run(offline, "Tôi thấy lú lẫn, vã mồ hôi sau khi tiêm insulin")
    assert [s["agent"] for s in out["trace"]] == ["safety_in", "safety_out"]
    assert out["sections"][0]["kind"] == "emergency"
