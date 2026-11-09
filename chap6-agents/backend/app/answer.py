"""Grounded answer generation: prompt with aliased sources, stream, then gate citations."""

import re
from collections.abc import Iterator
from dataclasses import dataclass
from functools import lru_cache

from openai import OpenAI

from .config import settings
from .retrieval import Hit
from .schema import AnswerState

CITE = re.compile(r"\[\[cite:(S\d+)\]\]")
ALIAS = r"(?:cite:\s*)?S?\d+"
CITE_VARIANTS = re.compile(rf"\[\[?\s*({ALIAS}(?:\s*,\s*{ALIAS})*)\s*\]?\]")
NO_EVIDENCE = "KHONG_DU_BANG_CHUNG"

SYSTEM = f"""Bạn là trợ lý tra cứu thông tin về đái tháo đường, trả lời bằng tiếng Việt.
Chỉ dùng thông tin trong các NGUỒN được cung cấp. Nguồn có thể bằng tiếng Anh; hãy diễn đạt lại bằng tiếng Việt.
Sau mỗi câu hoặc ý có thông tin lấy từ nguồn, đặt dấu trích dẫn dạng [[cite:S1]]; nhiều nguồn thì viết liền nhau như [[cite:S1]][[cite:S3]].
Không thêm cơ chế, liều thuốc, con số hay khuyến nghị không có trong nguồn. Giữ nguyên điều kiện áp dụng mà nguồn nêu.
Không chẩn đoán hay kê đơn cho cá nhân.
Nếu các nguồn không chứa thông tin trả lời câu hỏi, chỉ viết đúng một dòng: {NO_EVIDENCE}
Trả lời ngắn gọn, 3 đến 8 câu, có thể dùng gạch đầu dòng."""


@lru_cache
def client() -> OpenAI:
    s = settings()
    return OpenAI(base_url=s.llm_base_url, api_key=s.openai_api_key, timeout=60)


def alias(i: int) -> str:
    return f"S{i + 1}"


def build_messages(question: str, hits: list[Hit]) -> list[dict]:
    blocks = []
    for i, h in enumerate(hits):
        facts = "".join(f"\n- Dữ kiện liên quan: {f}" for f in h.facts[:4])
        blocks.append(f"[{alias(i)}] {h.title} ({h.publisher}, {h.lang})\n{h.text}{facts}")
    user = "NGUỒN:\n\n" + "\n\n".join(blocks) + f"\n\nCÂU HỎI: {question}"
    return [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}]


def stream_answer(question: str, hits: list[Hit]) -> Iterator[str]:
    response = client().chat.completions.create(
        model=settings().model_name,
        messages=build_messages(question, hits),
        temperature=0.1,
        max_tokens=900,
        stream=True,
    )
    for chunk in response:
        if chunk.choices and (delta := chunk.choices[0].delta.content):
            yield delta


@dataclass
class Gated:
    text: str
    state: AnswerState
    used: list[str]


def gate(raw: str, n_sources: int) -> Gated:
    """Drop citations to aliases that were never provided; no surviving citation means no answer."""
    valid = {alias(i) for i in range(n_sources)}
    raw = CITE_VARIANTS.sub(lambda m: "".join(f"[[cite:S{n}]]" for n in re.findall(r"\d+", m.group(1))), raw)
    if NO_EVIDENCE in raw:
        return Gated("", AnswerState.INSUFFICIENT_EVIDENCE, [])
    text = CITE.sub(lambda m: m.group(0) if m.group(1) in valid else "", raw).strip()
    used = list(dict.fromkeys(CITE.findall(text)))
    if not used:
        return Gated("", AnswerState.INSUFFICIENT_EVIDENCE, [])
    return Gated(text, AnswerState.ANSWERED, used)
