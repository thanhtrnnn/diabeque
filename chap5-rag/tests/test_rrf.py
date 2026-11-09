from backend.app.retrieval import RRF_K, detect_topic, rrf
from backend.app.schema import Topic


def test_rrf_rewards_agreement_between_branches():
    fused = rrf({"bm25": ["a", "b", "c"], "vector": ["b", "a", "d"], "graph": ["d"]})
    assert [cid for cid, _, _ in fused] == ["a", "b", "d", "c"]
    a_score = 1 / (RRF_K + 1) + 1 / (RRF_K + 2)
    assert abs(fused[0][1] - a_score) < 1e-12
    assert fused[2][2] == ["vector", "graph"]


def test_detect_topic_from_question():
    assert detect_topic("Đái tháo đường type 2 nên ăn gì?") is Topic.TYPE2
    assert detect_topic("Tiền đái tháo đường có chữa được không") is Topic.PREDIABETES
    assert detect_topic("Đái tháo đường týp 1 ở trẻ em") is Topic.TYPE1
    assert detect_topic("Đái tháo đường là gì") is None
