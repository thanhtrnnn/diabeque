from eval.run_eval import metrics


def test_metrics_match_hand_computed_example():
    m = metrics({"a", "b"}, ["a", "c", "d", "e", "f"])
    assert m["hit@3"] == 1.0
    assert m["recall@3"] == 0.5
    assert abs(m["precision@3"] - 1 / 3) < 1e-12
    assert m["mrr@10"] == 1.0


def test_miss_scores_zero():
    m = metrics({"z"}, ["a", "b", "c", "d", "e"])
    assert (m["hit@5"], m["recall@5"], m["mrr@10"]) == (0.0, 0.0, 0.0)


def test_relevance_requires_quote_found_in_chunk():
    from eval.run_eval import judged_relevant

    text = "Symptoms include  feeling very thirsty and\nurinating often."
    assert judged_relevant({"relevant": True, "quote": "feeling very thirsty and urinating often"}, text)
    assert not judged_relevant({"relevant": True, "quote": "blurred vision and fatigue appear"}, text)
    assert not judged_relevant({"relevant": False, "quote": "feeling very thirsty"}, text)
