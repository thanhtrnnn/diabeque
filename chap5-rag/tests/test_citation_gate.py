from backend.app.answer import NO_EVIDENCE, gate
from backend.app.schema import AnswerState


def test_unknown_alias_is_removed_and_known_kept():
    g = gate("Ăn nhiều rau [[cite:S1]]. Uống thuốc X [[cite:S9]].", n_sources=3)
    assert g.state is AnswerState.ANSWERED
    assert g.text == "Ăn nhiều rau [[cite:S1]]. Uống thuốc X ."
    assert g.used == ["S1"]


def test_answer_without_valid_citation_is_insufficient():
    assert gate("Câu trả lời không nguồn [[cite:S7]].", n_sources=2).state is AnswerState.INSUFFICIENT_EVIDENCE
    assert gate(NO_EVIDENCE, n_sources=5).state is AnswerState.INSUFFICIENT_EVIDENCE


def test_citation_variants_are_normalized():
    g = gate("Ý một [[S2]]. Ý hai [S1][cite:S3].", n_sources=3)
    assert g.text == "Ý một [[cite:S2]]. Ý hai [[cite:S1]][[cite:S3]]."
    assert g.used == ["S2", "S1", "S3"]


def test_citation_lists_and_bare_numbers_are_expanded():
    g = gate("Ý một [[1, 3]]. Ý hai [[S2, S4]].", n_sources=3)
    assert g.text == "Ý một [[cite:S1]][[cite:S3]]. Ý hai [[cite:S2]]."
    assert g.used == ["S1", "S3", "S2"]
