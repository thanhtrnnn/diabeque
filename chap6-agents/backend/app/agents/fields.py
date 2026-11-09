"""What the intake agent must collect, how to ask for it, and how raw answers map to BRFSS codes."""

from ..classify import FIELDS

FIELD_BY_NAME = {f["name"]: f for f in FIELDS}

# Asked before predicting. Other features fall back to the training median, and the reply says so.
REQUIRED = ["Age", "Sex", "BMI", "HighBP", "HighChol", "PhysActivity", "GenHlth"]
ASK_PER_TURN = 3

QUESTIONS: dict[str, str] = {
    "Age": "Anh/chị bao nhiêu tuổi?",
    "Sex": "Giới tính của anh/chị là nam hay nữ?",
    "BMI": "Chiều cao và cân nặng của anh/chị là bao nhiêu (ví dụ 1m65, 70kg)?",
    "HighBP": "Anh/chị đã từng được bác sĩ nói là bị huyết áp cao chưa?",
    "HighChol": "Anh/chị đã từng được nói là có cholesterol (mỡ máu) cao chưa?",
    "PhysActivity": "Trong 30 ngày qua, anh/chị có tập thể dục hoặc vận động thể chất ngoài công việc hằng ngày không?",
    "GenHlth": "Anh/chị tự đánh giá sức khỏe chung của mình thế nào: xuất sắc, rất tốt, tốt, trung bình hay kém?",
}

# BRFSS age groups: 1 = 18-24, 2 = 25-29, ..., 12 = 75-79, 13 = 80+.
AGE_LOWER = [18, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80]


def age_group(years: float) -> int | None:
    if years < 18:
        return None
    return max(i + 1 for i, lo in enumerate(AGE_LOWER) if years >= lo)


def bmi(height_m: float, weight_kg: float) -> float:
    if height_m > 3:  # given in centimetres
        height_m /= 100
    return round(weight_kg / height_m**2, 1)


def missing(profile: dict[str, float]) -> list[str]:
    return [name for name in REQUIRED if profile.get(name) is None]


def describe_value(name: str, value: float) -> str:
    field = FIELD_BY_NAME[name]
    for opt in field.get("options", []):
        if opt["value"] == value:
            return opt["label_vi"]
    if field["kind"] == "binary":
        return "có" if value == 1 else "không"
    return f"{value:g}"


def describe_profile(profile: dict[str, float]) -> str:
    return "; ".join(f"{FIELD_BY_NAME[k]['label_vi']}: {describe_value(k, v)}" for k, v in profile.items() if k in FIELD_BY_NAME)
