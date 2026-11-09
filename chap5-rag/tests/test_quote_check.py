from pipeline.extract_facts import slug, verify

CHUNK = "People with prediabetes  should aim to lose\n5 to 7 percent of their body weight."
FACT = {"kind": "recommendation", "disease": "tien_dtd", "key_vi": "Giảm cân", "text_vi": "Giảm 5-7% cân nặng", "condition": None}


def test_fabricated_quote_is_rejected():
    fact, reason = verify(FACT | {"quote": "should take metformin every day"}, CHUNK, {})
    assert fact is None and reason == "quote_not_in_chunk"


def test_quote_with_different_whitespace_is_kept():
    fact, reason = verify(FACT | {"quote": "should aim to lose 5 to 7 percent"}, CHUNK, {})
    assert reason == ""
    assert fact["id"] == "recommendation_giam_can"


def test_synonym_maps_to_canonical_id():
    fact, _ = verify(
        {"kind": "symptom", "disease": "dtd_chung", "key_vi": "Khát nước nhiều", "quote": "prediabetes  should"},
        CHUNK,
        {"khát nước nhiều": "khát nhiều"},
    )
    assert fact["id"] == "symptom_khat_nhieu"
    assert slug("Đái tháo đường type 2") == "dai_thao_duong_type_2"
