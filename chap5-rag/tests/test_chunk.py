import json
from collections import Counter

import pytest

from pipeline import clean_chunk as cc

PARAGRAPHS = [
    "Đái tháo đường là bệnh rối loạn chuyển hóa mạn tính, đặc trưng bởi lượng đường trong máu tăng cao kéo dài. "
    "Nguyên nhân là do tuyến tụy không sản xuất đủ insulin hoặc cơ thể không sử dụng insulin hiệu quả. "
    "Bệnh có thể gây tổn thương tim, mắt, thận và thần kinh nếu không được kiểm soát tốt trong nhiều năm liền.",
    "Triệu chứng thường gặp gồm khát nước nhiều, đi tiểu nhiều, ăn nhiều nhưng sụt cân và mệt mỏi kéo dài. "
    "Nhiều người bệnh đái tháo đường típ 2 không có triệu chứng rõ ràng trong giai đoạn đầu nên bệnh thường được phát hiện muộn. "
    "Vì vậy người có yếu tố nguy cơ cần được xét nghiệm đường huyết định kỳ theo hướng dẫn của bác sĩ chuyên khoa.",
    "Chẩn đoán dựa trên xét nghiệm glucose huyết tương lúc đói từ 7,0 mmol/L trở lên, hoặc HbA1c từ 6,5% trở lên. "
    "Người bệnh cần duy trì chế độ ăn hợp lý, vận động đều đặn khoảng 150 phút mỗi tuần và tuân thủ điều trị. "
    "Metformin thường là thuốc đầu tay được lựa chọn cho người bệnh đái tháo đường típ 2 mới được chẩn đoán.",
]
SAMPLE_HTML = f"""<!doctype html><html lang="vi"><head><title>Đái tháo đường là gì? | Bệnh viện Mẫu</title></head><body>
<nav><ul><li><a href="/">Trang chủ</a></li><li><a href="/tin-tuc">Tin tức</a></li><li><a href="/dat-lich">Đặt lịch khám</a></li></ul></nav>
<article>
<h1>Đái tháo đường là gì?</h1>
<p>{PARAGRAPHS[0]}</p>
<div class="ads"><p>Quảng cáo: Mua ngay thực phẩm chức năng, khuyến mãi giảm giá 50%</p></div>
<p>{PARAGRAPHS[1]}</p>
<p>Đặt lịch khám ngay, gọi hotline 1900 1234 để được tư vấn miễn phí.</p>
<p>{PARAGRAPHS[2]}</p>
<p>Chia sẻ:</p>
</article>
<footer><p>Hệ thống bệnh viện đa khoa mẫu. Hotline: 1900 1234</p></footer>
</body></html>"""
MENU_AND_ADS = ["Trang chủ", "Tin tức", "Đặt lịch khám", "hotline", "Quảng cáo", "Mua ngay", "khuyến mãi", "Chia sẻ"]


@pytest.fixture
def corpus(tmp_path, monkeypatch):
    monkeypatch.setattr(cc, "RAW", tmp_path)

    def build(htmls: dict[str, str]):
        manifest = []
        for doc_id, html in htmls.items():
            (tmp_path / f"{doc_id}.html").write_text(html, encoding="utf-8")
            manifest.append({"id": doc_id, "url": f"https://example.org/{doc_id}", "publisher": "Bệnh viện Mẫu", "lang": "vi", "kind": "html", "topic": "t", "title": None, "sha256": "abc", "fetched_at": "2026-10-25T00:00:00+00:00"})
        return cc.build(manifest, cc.load_patterns())

    return build


def sentences(n: int, start: int = 1) -> list[str]:
    return [f"Câu số {i:03d} nói về đường huyết sau bữa ăn." for i in range(start, start + n)]


def test_menu_and_ads_do_not_reach_the_chunks(corpus):
    documents, chunks, stats = corpus({"mau": SAMPLE_HTML})
    text = "\n".join(c["text"] for c in chunks)
    assert [m for m in MENU_AND_ADS if m.lower() in text.lower()] == []
    for paragraph in PARAGRAPHS:
        assert paragraph in text
    assert documents[0]["title"] == "Đái tháo đường là gì?"
    assert len(chunks) == 1
    assert chunks[0]["id"] == "mau#000"
    assert chunks[0]["n_tokens"] <= 400


def test_every_chunk_stays_under_400_tokens(corpus):
    long_paragraph = " ".join(sentences(160))
    _, chunks, _ = corpus({"dai": SAMPLE_HTML.replace(PARAGRAPHS[0], long_paragraph)})
    assert len(chunks) == 6
    assert [c["id"] for c in chunks] == [f"dai#{i:03d}" for i in range(6)]
    assert all(cc.count_tokens(c["text"]) == c["n_tokens"] <= 400 for c in chunks)
    assert max(c["n_tokens"] for c in chunks) >= 350


def test_next_chunk_starts_with_the_closing_sentences_of_the_previous_one():
    chunks = cc.chunk([" ".join(sentences(160))])
    assert len(chunks) == 6
    assert chunks[0].endswith("Câu số 029 nói về đường huyết sau bữa ăn.")
    assert chunks[1].startswith("Câu số 026 nói về đường huyết sau bữa ăn. Câu số 027")


def test_heading_moves_to_the_chunk_it_introduces():
    body = " ".join(sentences(28))
    chunks = cc.chunk([body, "Triệu chứng thường gặp", " ".join(sentences(18, start=100))])
    assert not chunks[0].endswith("Triệu chứng thường gặp")
    assert chunks[1].startswith("Câu số 025") and "\nTriệu chứng thường gặp\nCâu số 100" in chunks[1]


def test_a_fragment_shorter_than_15_tokens_is_not_used_as_overlap():
    long_sentence = " và ".join(f"ý số {i:03d} về đường huyết" for i in range(1, 12)) + "."
    first = " ".join(sentences(24)) + " " + long_sentence + " (C)"
    chunks = cc.chunk([first, " ".join(sentences(18, start=100))])
    assert len(chunks) == 2
    assert chunks[0].endswith("(C)")
    assert chunks[1].startswith("Câu số 100")


def test_boilerplate_lines_are_counted_and_removed():
    lines = ["Triệu chứng gồm khát nước và đi tiểu nhiều, kéo dài nhiều tuần.", "Trang chủ", "Gọi hotline 1900 1234 để đặt lịch khám", "Chia sẻ:", "Metformin là thuốc đầu tay cho đái tháo đường típ 2."]
    kept, boiler, junk = cc.drop_boilerplate(lines, cc.load_patterns())
    assert kept == [lines[0], lines[4]]
    assert (boiler, junk) == (3, 0)


def test_cut_rule_drops_everything_after_the_reference_heading():
    lines = ["Kiểm soát đường huyết giúp ngăn ngừa biến chứng.", "References", "1. Smith J. Diabetes care. 2020.", "2. Lee K. Insulin. 2021."]
    kept, boiler, _ = cc.drop_boilerplate(lines, cc.load_patterns())
    assert kept == [lines[0]]
    assert boiler == 3


def test_paragraph_repeated_across_documents_is_kept_once(corpus):
    other = SAMPLE_HTML.replace(PARAGRAPHS[1], PARAGRAPHS[1].replace("Triệu chứng thường gặp", "Dấu hiệu hay gặp"))
    _, chunks, stats = corpus({"mot": SAMPLE_HTML, "hai": other})
    assert stats["duplicate_paragraphs"] == 2
    assert PARAGRAPHS[0] in chunks[0]["text"] and PARAGRAPHS[0] not in "\n".join(c["text"] for c in chunks[1:])


def test_pdf_lines_are_rebuilt_into_paragraphs_without_running_headers():
    pages = [
        ["HƯỚNG DẪN CHẨN ĐOÁN", "Đái tháo đường là bệnh mạn", "tính cần theo dõi suốt đời.", "- Ăn uống hợp lý.", "- Vận động đều.", "1"],
        ["HƯỚNG DẪN CHẨN ĐOÁN", "Người bệnh nên đo đường huyết", "tại nhà mỗi ngày.", "2"],
        ["HƯỚNG DẪN CHẨN ĐOÁN", "Tái khám đúng hẹn.", "3"],
    ]
    assert cc.pdf_paragraphs(pages) == [
        "Đái tháo đường là bệnh mạn tính cần theo dõi suốt đời.",
        "- Ăn uống hợp lý.",
        "- Vận động đều.",
        "Người bệnh nên đo đường huyết tại nhà mỗi ngày.",
        "Tái khám đúng hẹn.",
    ]


def test_split_words_are_joined_only_when_the_whole_is_a_known_word():
    known = {"quy", "định", "có", "ảnh", "hưởng"}
    targets = known | {"quyết"}
    assert cc.join_split_words("Quy ết định có ảnh hưởng", known, targets) == "Quyết định có ảnh hưởng"
    assert cc.join_split_words("r egular ar eas", set(), {"regular", "areas"}) == "regular areas"
