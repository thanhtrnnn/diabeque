"""Safety agent: rule-based checks before and after the LLM agents. Written as code, not prompt, so it is testable."""

import re

from ..schema import DISCLAIMER

# Input: warning signs that need a clinic now, not a chat answer.
EMERGENCY_PATTERNS = [
    r"hôn mê|bất tỉnh|ngất|co giật|lơ mơ|lú lẫn",
    r"khó thở|thở (nhanh|sâu)|hơi thở (có )?mùi (trái cây|táo)",
    r"đau (thắt )?ngực",
    r"nôn (nhiều|liên tục|ói)|nôn mửa",
    r"(vã|đổ) mồ hôi.{0,40}(run|chóng mặt|insulin)|(run|chóng mặt).{0,40}(vã|đổ) mồ hôi",
    r"đường huyết.{0,25}\b([4-9]\d\d|[1-9]\d{3})\s*(mg/dl|mg)",   # >= 400 mg/dL
    r"đường huyết.{0,25}\b(2[5-9]|[3-9]\d)([.,]\d+)?\s*mmol",     # >= 25 mmol/L
    r"đường huyết.{0,25}\b([0-5]\d|6[0-9])\s*(mg/dl|mg)\b",          # < 70 mg/dL
    r"đường huyết.{0,25}\b([0-3])([.,]\d+)?\s*mmol",                 # < 4 mmol/L
    r"tự tử|muốn chết",
]
EMERGENCY = re.compile("|".join(f"(?:{p})" for p in EMERGENCY_PATTERNS), re.I)

DOSAGE_NOTICE = (
    "Diabeque không đưa liều thuốc cụ thể. Liều insulin và thuốc hạ đường huyết do bác sĩ điều trị chỉ định theo đường huyết, "
    "cân nặng và phác đồ của từng người; anh/chị hãy hỏi bác sĩ trước khi thay đổi liều."
)

EMERGENCY_TEXT = (
    "Những dấu hiệu anh/chị mô tả có thể là tình huống cấp cứu (ví dụ hạ đường huyết nặng hoặc nhiễm toan ceton). "
    "Hãy gọi **115** hoặc đến cơ sở y tế gần nhất ngay. Nếu đang dùng insulin hoặc thuốc hạ đường huyết và còn tỉnh, "
    "người bên cạnh nên đưa người bệnh đi khám ngay, không chờ hỏi đáp thêm."
)

# Output: sentences that give a dose or a definitive personal diagnosis are removed.
DOSAGE = re.compile(r"\b\d+([.,]\d+)?\s*(mg|mcg|µg|g|ui|iu|đơn vị|ml)\b(?!\s*/\s*dl)", re.I)
# Dose split or weight-based dose without a unit: "2/3 tổng liều", "0,5 đơn vị/kg" is caught above.
DOSE_SPLIT = re.compile(r"\b\d+\s*/\s*\d+\s*(tổng\s+)?liều", re.I)

DIAGNOSIS = re.compile(
    r"(anh/chị|anh|chị|bạn|quý vị)\s+(chắc chắn\s+)?(đã\s+)?(bị|mắc|có)\s+(bệnh\s+)?(đái tháo đường|tiểu đường|tiền đái tháo đường)"
    r"|chẩn đoán (anh/chị|bạn) (bị|mắc)",
    re.I,
)
SENTENCE = re.compile(r"(?<=[.!?])\s+")
CONDITIONAL = re.compile(r"\b(nếu|khi|trường hợp|liệu|có phải|người)\b", re.I)
BULLET = re.compile(r"^\s*([-*•]|\d+[.)])\s+")


def is_emergency(message: str) -> bool:
    return bool(EMERGENCY.search(message))


def filter_text(text: str) -> tuple[str, list[str]]:
    """Drop sentences with a dose or a definitive diagnosis. Returns cleaned text and the flags raised."""
    flags, lines = [], []
    for line in text.split("\n"):
        kept = []
        for sentence in SENTENCE.split(line):
            if DOSAGE.search(sentence) or DOSE_SPLIT.search(sentence):
                flags.append("dosage_removed")
            elif DIAGNOSIS.search(sentence) and not CONDITIONAL.search(sentence) and not sentence.rstrip().endswith("?"):
                flags.append("diagnosis_removed")
            elif sentence.strip():
                kept.append(sentence.strip())
        if kept and (m := BULLET.match(line)) and not BULLET.match(kept[0]):
            kept[0] = m.group(0) + kept[0]
        if kept or not line.strip():
            lines.append(" ".join(kept))
    return "\n".join(lines).strip(), sorted(set(flags))


__all__ = ["DISCLAIMER", "DOSAGE_NOTICE", "EMERGENCY_TEXT", "filter_text", "is_emergency"]
