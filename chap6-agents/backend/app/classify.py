"""Survey classifier inference and the form-field registry shared with the training pipeline."""

import json
import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import torch
from torch import nn

from .nets import build
from .schema import LABEL_NAMES, LABEL_TOPIC, Task

MODELS_DIR = Path(__file__).resolve().parents[2] / "models"

_AGE_GROUPS = ["18-24", "25-29", "30-34", "35-39", "40-44", "45-49", "50-54", "55-59", "60-64", "65-69", "70-74", "75-79", "80+"]
_INCOME_GROUPS = ["< 10 nghìn USD", "10-15 nghìn", "15-20 nghìn", "20-25 nghìn", "25-35 nghìn", "35-50 nghìn", "50-75 nghìn", "≥ 75 nghìn USD"]
_EDUCATION = ["Chưa đi học hoặc mẫu giáo", "Lớp 1-8", "Lớp 9-11", "Tốt nghiệp lớp 12 hoặc GED", "Đại học 1-3 năm", "Đại học từ 4 năm"]
_GEN_HEALTH = ["Xuất sắc", "Rất tốt", "Tốt", "Trung bình", "Kém"]


def _options(labels: list[str]) -> list[dict]:
    return [{"value": i + 1, "label_vi": label} for i, label in enumerate(labels)]


def _field(name: str, label_vi: str, kind: str, lo: float, hi: float, options: list[dict] | None = None) -> dict:
    field = {"name": name, "label_vi": label_vi, "kind": kind, "min": lo, "max": hi}
    return field | {"options": options} if options else field


def _binary(name: str, label_vi: str) -> dict:
    return _field(name, label_vi, "binary", 0, 1)


# Order is the model input order. Fruits and Veggies exist in BRFSS 2015 but not in the 2023 file.
FIELDS: list[dict] = [
    _binary("HighBP", "Huyết áp cao"),
    _binary("HighChol", "Cholesterol cao"),
    _binary("CholCheck", "Đã kiểm tra cholesterol trong 5 năm qua"),
    _field("BMI", "Chỉ số khối cơ thể (BMI)", "number", 10, 100),
    _binary("Smoker", "Đã hút ít nhất 100 điếu thuốc trong đời"),
    _binary("Stroke", "Từng bị đột quỵ"),
    _binary("HeartDiseaseorAttack", "Bệnh mạch vành hoặc nhồi máu cơ tim"),
    _binary("PhysActivity", "Có vận động thể chất trong 30 ngày qua"),
    _binary("HvyAlcoholConsump", "Uống rượu bia nhiều"),
    _binary("AnyHealthcare", "Có bảo hiểm y tế"),
    _binary("NoDocbcCost", "Không đi khám vì chi phí trong 12 tháng qua"),
    _field("GenHlth", "Tự đánh giá sức khỏe chung", "ordinal", 1, 5, _options(_GEN_HEALTH)),
    _field("MentHlth", "Số ngày sức khỏe tinh thần không tốt (30 ngày qua)", "number", 0, 30),
    _field("PhysHlth", "Số ngày sức khỏe thể chất không tốt (30 ngày qua)", "number", 0, 30),
    _binary("DiffWalk", "Khó khăn khi đi bộ hoặc leo cầu thang"),
    _field("Sex", "Giới tính", "binary", 0, 1, [{"value": 0, "label_vi": "Nữ"}, {"value": 1, "label_vi": "Nam"}]),
    _field("Age", "Nhóm tuổi", "ordinal", 1, 13, _options(_AGE_GROUPS)),
    _field("Education", "Trình độ học vấn", "ordinal", 1, 6, _options(_EDUCATION)),
    _field("Income", "Thu nhập hộ gia đình mỗi năm", "ordinal", 1, 8, _options(_INCOME_GROUPS)),
]
FEATURE_NAMES: list[str] = [f["name"] for f in FIELDS]
FEATURES: dict[Task, list[dict]] = {task: FIELDS for task in Task}


@dataclass(frozen=True)
class Classifier:
    arch: str
    model: nn.Module
    features: list[str]
    medians: list[float]
    means: list[float]
    stds: list[float]
    temperature: float
    classes: list[int]


@lru_cache
def _load(task: Task) -> Classifier:
    folder = MODELS_DIR / task.value
    pre = json.loads((folder / "preprocess.json").read_text())
    arch = pre.get("arch", "mlp")
    model = build(arch, len(pre["features"]), len(pre["classes"]))
    model.load_state_dict(torch.load(folder / "model.pt", map_location="cpu", weights_only=True))
    model.eval()
    return Classifier(arch, model, pre["features"], pre["medians"], pre["means"], pre["stds"], pre["temperature"], pre["classes"])


def _check(task: Task, features: dict[str, float]) -> None:
    ranges = {f["name"]: (f["min"], f["max"]) for f in FEATURES[task]}
    unknown = set(features) - set(ranges)
    if unknown:
        raise ValueError(f"unknown features: {sorted(unknown)}")
    for name, value in features.items():
        if value is None or math.isnan(value):
            continue
        lo, hi = ranges[name]
        if not lo <= value <= hi:
            raise ValueError(f"{name}={value} outside [{lo}, {hi}]")


def predict(task: Task, features: dict[str, float]) -> dict:
    _check(task, features)
    clf = _load(task)
    raw = [features.get(name) for name in clf.features]
    row = [m if v is None or math.isnan(v) else v for v, m in zip(raw, clf.medians)]
    x = torch.tensor([[(v - mu) / sd for v, mu, sd in zip(row, clf.means, clf.stds)]], dtype=torch.float32)
    with torch.no_grad():
        probs = torch.softmax(clf.model(x)[0] / clf.temperature, dim=0).tolist()
    best = max(range(len(probs)), key=probs.__getitem__)
    label = clf.classes[best]
    return {
        "label": label,
        "label_name": LABEL_NAMES[(task, label)],
        "probs": dict(zip(clf.classes, probs)),
        "topic": LABEL_TOPIC[(task, label)],
        "model": clf.arch,
    }
