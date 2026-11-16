"""Rule-Based Agent, coordinator aggregate, message contract and Monitoring agent."""

import json

from backend.app.agents import nodes, rules


def test_parse_labs_units_and_ranges():
    assert rules.parse_labs(["HbA1c của tôi 6,8%"]) == {"hba1c": 6.8}
    assert rules.parse_labs(["đường huyết lúc đói 7.2 mmol/L"]) == {"fpg_mg_dl": 129.6}
    assert rules.parse_labs(["glucose đói 110 mg/dl"]) == {"fpg_mg_dl": 110.0}
    assert rules.parse_labs(["tôi 45 tuổi"]) == {}


def test_rules_thresholds_and_screening():
    profile = {"Age": 6, "BMI": 24.5, "HighBP": 1, "HighChol": 0, "PhysActivity": 0}
    out = {r["id"]: r for r in rules.evaluate(profile, {"hba1c": 6.6}, None)}
    assert out["R01"]["fired"] and out["R02"]["fired"] and not out["R03"]["fired"]
    assert out["R06"]["fired"]
    assert out["L01"]["severity"] == "lab_diabetes"
    assert "L01:lab_diabetes" in rules.review_flags(list(out.values()))


def test_rules_flag_model_rule_disagreement():
    pred = {"task": "status3", "label": 0, "label_name": "Không báo cáo mắc"}
    out = rules.evaluate({"BMI": 22}, {"fpg_mg_dl": 130.0}, pred)
    assert any(r["id"] == "V01" and r["fired"] for r in out)


def test_assessment_turn_runs_rules_and_audits(offline, tmp_path):
    graph = offline
    cfg = {"configurable": {"thread_id": "rules-audit"}}
    base = {"intent": "", "request_id": "req_test", "conversation_id": "rules-audit", "rules": [], "decision": None,
            "llm_down": False, "emergency": False, "missing": [], "sources": [], "sections": [], "safety_flags": [], "trace": []}
    graph.invoke({**base, "message": "Tôi 52 tuổi, nam, cao 1m65 nặng 80kg, bị huyết áp cao, HbA1c 6,1%. Tôi có nguy cơ không?"}, cfg)
    graph.invoke({**base, "message": "mỡ máu không, ít vận động, sức khỏe trung bình"}, cfg)
    state = graph.get_state(cfg).values
    agents = [s["agent"] for s in state["trace"]]
    assert agents[-4:] == ["rules", "advisor", "safety_out", "audit"]
    step = next(s for s in state["trace"] if s["agent"] == "rules")
    assert step["request_id"] == "req_test" and step["status"] == "ok" and step["version"] == rules.RULESET_VERSION
    assert "L01" in step["evidence"]
    assert state["decision"]["prediction"]["label"] == 2 and "L01:lab_prediabetes" in state["decision"]["flags"]
    assert any(s["kind"] == "rules" for s in state["sections"])
    rec = json.loads(nodes.AUDIT_LOG.read_text().splitlines()[-1])
    assert rec["request_id"] == "req_test" and "message" not in rec and rec["steps"][-1]["agent"] == "safety_out"
