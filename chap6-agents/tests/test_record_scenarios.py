"""The recording script's trace checks, on fake traces (no LLM, no Neo4j, nothing written)."""

from eval import record_scenarios as rec


def step(agent, fallback=None):
    return {"agent": agent, "fallback": fallback}


def turn(*steps, titles=()):
    return {"steps": list(steps), "sections": [{"kind": "notice", "title": t, "text": ""} for t in titles]}


KNOW = [step("safety_in"), step("orchestrator"), step("knowledge"), step("safety_out")]
DIRECT = [step("safety_in"), step("orchestrator"), step("safety_out")]


def test_good_live_turn_has_no_problems():
    assert rec.check_turn("kien-thuc", 1, turn(*KNOW), False, (rec.KNOWLEDGE,), {}) == []


def test_wrong_sequence_is_reported():
    out = rec.check_turn("kien-thuc", 1, turn(*DIRECT), False, (rec.KNOWLEDGE,), {})
    assert len(out) == 1 and "kien-thuc turn 1" in out[0] and "got safety_in > orchestrator > safety_out" in out[0]


def test_live_turn_with_fallback_is_reported():
    steps = [step("safety_in"), step("orchestrator", "rules"), step("knowledge", "passages"), step("safety_out")]
    out = rec.check_turn("kien-thuc", 1, turn(*steps), False, (rec.KNOWLEDGE,), {})
    assert len(out) == 1 and "orchestrator=rules" in out[0] and "knowledge=passages" in out[0]


def test_out_of_scope_accepts_both_routes_and_needs_title():
    for steps in (DIRECT, KNOW):
        assert rec.check_turn("ngoai-pham-vi", 1, turn(*steps, titles=["Ngoài phạm vi"]), False, rec.OUT_OF_SCOPE_ROUTES, {}) == []
    out = rec.check_turn("ngoai-pham-vi", 1, turn(*DIRECT, titles=["Giới thiệu"]), False, rec.OUT_OF_SCOPE_ROUTES, {})
    assert len(out) == 1 and "Ngoài phạm vi" in out[0]


def test_outage_turns_require_their_fallbacks():
    ask = [step("safety_in"), step("orchestrator", "rules"), step("intake", "rules"), step("safety_out")]
    assert rec.check_turn("llm-sap", 1, turn(*ask), True, (rec.ASK_MORE,), rec.OUTAGE_TURN1) == []
    know = [step("safety_in"), step("orchestrator", "rules"), step("knowledge", "passages"), step("safety_out")]
    assert rec.check_turn("llm-sap", 2, turn(*know), True, (rec.KNOWLEDGE,), rec.OUTAGE_TURN2) == []
    no_fallback = [step("safety_in"), step("orchestrator"), step("knowledge"), step("safety_out")]
    out = rec.check_turn("llm-sap", 2, turn(*no_fallback), True, (rec.KNOWLEDGE,), rec.OUTAGE_TURN2)
    assert len(out) == 2 and "orchestrator fallback" in out[0] and "knowledge fallback" in out[1]
