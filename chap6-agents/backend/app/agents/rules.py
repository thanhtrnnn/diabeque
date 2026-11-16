"""Rule-Based Agent: explicit, reviewed screening rules that run beside the DL model and never replace it.

Every rule is a plain function of the profile (BRFSS codes) and of lab values the user typed, so its result can be
audited line by line. Thresholds follow the ADA Standards of Care 2025, section 2 (screening and diagnosis); the
BMI cut-off for Asian adults is 23. The output is a list of rule results plus review flags; it is supporting
evidence for the advisor, not a diagnosis.
"""

import re
from typing import Any, TypedDict

RULESET_VERSION = "ada-soc-2025-s2.v1"
ADA_SOURCE = "ADA Standards of Care in Diabetes 2025, mục 2"

# BRFSS age groups: 4 = 35–39 (see fields.AGE_LOWER).
AGE_35_GROUP = 4
BMI_ASIAN = 23.0


class RuleResult(TypedDict):
    id: str
    title: str
    fired: bool
    severity: str        # info | risk | lab_prediabetes | lab_diabetes | review
    evidence: str
    source: str


def _r(rid: str, title: str, fired: bool, severity: str, evidence: str, source: str = ADA_SOURCE) -> RuleResult:
    return {"id": rid, "title": title, "fired": fired, "severity": severity, "evidence": evidence, "source": source}


# ------------------------------------------------------------------ lab values typed by the user

_NUM = r"(\d+(?:[.,]\d+)?)"
HBA1C = re.compile(r"hb\s*a1c[^0-9\n]{0,20}?" + _NUM, re.IGNORECASE)
FPG = re.compile(r"(?:đường\s*huyết|glucose|fpg)[^0-9\n]{0,30}?(?:lúc\s*)?đói[^0-9\n]{0,15}?" + _NUM + r"\s*(mg/?dl|mmol/?l)?"
                 r"|fpg[^0-9\n]{0,15}?" + _NUM + r"\s*(mg/?dl|mmol/?l)?", re.IGNORECASE)


def _num(s: str) -> float:
    return float(s.replace(",", "."))


def parse_labs(texts: list[str]) -> dict[str, float]:
    """HbA1c (%) and fasting plasma glucose (mg/dL) from the user's messages; the latest mention wins."""
    labs: dict[str, float] = {}
    for text in texts:
        for m in HBA1C.finditer(text):
            v = _num(m.group(1))
            if 3 <= v <= 20:
                labs["hba1c"] = v
        for m in FPG.finditer(text):
            raw, unit = (m.group(1), m.group(2)) if m.group(1) else (m.group(3), m.group(4))
            v = _num(raw)
            mmol = (unit or "").lower().startswith("mmol") or (not unit and v < 35)
            mg = round(v * 18.0, 1) if mmol else v
            if 40 <= mg <= 600:
                labs["fpg_mg_dl"] = mg
    return labs


# ------------------------------------------------------------------ rules


def evaluate(profile: dict[str, float], labs: dict[str, float], prediction: dict[str, Any] | None) -> list[RuleResult]:
    out: list[RuleResult] = []
    bmi, age = profile.get("BMI"), profile.get("Age")

    risk_factors = []
    if bmi is not None:
        fired = bmi >= BMI_ASIAN
        out.append(_r("R01", "Thừa cân theo ngưỡng người châu Á (BMI ≥ 23)", fired, "risk", f"BMI = {bmi:.1f}"))
    if profile.get("HighBP") is not None:
        fired = profile["HighBP"] == 1
        out.append(_r("R02", "Tăng huyết áp", fired, "risk", "HighBP = 1" if fired else "HighBP = 0"))
        if fired:
            risk_factors.append("tăng huyết áp")
    if profile.get("HighChol") is not None:
        fired = profile["HighChol"] == 1
        out.append(_r("R03", "Rối loạn mỡ máu", fired, "risk", "HighChol = 1" if fired else "HighChol = 0"))
        if fired:
            risk_factors.append("mỡ máu cao")
    if profile.get("PhysActivity") is not None:
        fired = profile["PhysActivity"] == 0
        out.append(_r("R04", "Ít vận động thể lực", fired, "risk", f"PhysActivity = {int(profile['PhysActivity'])}"))
        if fired:
            risk_factors.append("ít vận động")
    if age is not None:
        fired = age >= AGE_35_GROUP
        out.append(_r("R05", "Từ 35 tuổi trở lên", fired, "risk", f"nhóm tuổi BRFSS = {int(age)}"))

    overweight = bmi is not None and bmi >= BMI_ASIAN
    screen = (age is not None and age >= AGE_35_GROUP) or (overweight and bool(risk_factors))
    why = []
    if age is not None and age >= AGE_35_GROUP:
        why.append("≥ 35 tuổi")
    if overweight and risk_factors:
        why.append(f"BMI ≥ 23 kèm {', '.join(risk_factors)}")
    out.append(_r("R06", "Nên xét nghiệm sàng lọc (HbA1c hoặc đường huyết đói)", screen, "info",
                  "; ".join(why) or "chưa đủ tiêu chí sàng lọc"))

    if (a1c := labs.get("hba1c")) is not None:
        if a1c >= 6.5:
            out.append(_r("L01", "HbA1c trong ngưỡng chẩn đoán đái tháo đường (≥ 6,5%)", True, "lab_diabetes", f"HbA1c = {a1c}%"))
        elif a1c >= 5.7:
            out.append(_r("L01", "HbA1c trong ngưỡng tiền đái tháo đường (5,7–6,4%)", True, "lab_prediabetes", f"HbA1c = {a1c}%"))
        else:
            out.append(_r("L01", "HbA1c dưới ngưỡng tiền đái tháo đường", False, "info", f"HbA1c = {a1c}%"))
    if (fpg := labs.get("fpg_mg_dl")) is not None:
        if fpg >= 126:
            out.append(_r("L02", "Đường huyết đói trong ngưỡng chẩn đoán (≥ 126 mg/dL)", True, "lab_diabetes", f"FPG = {fpg:g} mg/dL"))
        elif fpg >= 100:
            out.append(_r("L02", "Đường huyết đói trong ngưỡng tiền đái tháo đường (100–125 mg/dL)", True, "lab_prediabetes",
                          f"FPG = {fpg:g} mg/dL"))
        else:
            out.append(_r("L02", "Đường huyết đói bình thường", False, "info", f"FPG = {fpg:g} mg/dL"))

    if prediction and prediction.get("task") == "status3":
        model_pos = prediction.get("label", 0) != 0
        lab_pos = any(r["fired"] and r["severity"].startswith("lab_") for r in out)
        lab_neg = any(not r["fired"] and r["id"].startswith("L") for r in out) and not lab_pos
        rule_risk = sum(r["fired"] for r in out if r["severity"] == "risk")
        if model_pos and lab_neg:
            out.append(_r("V01", "Mô hình xếp nhóm có nguy cơ nhưng xét nghiệm người dùng nhập ở ngưỡng bình thường", True, "review",
                          f"mô hình: {prediction.get('label_name')}", "kiểm tra chéo"))
        elif not model_pos and lab_pos:
            out.append(_r("V01", "Xét nghiệm vượt ngưỡng nhưng mô hình xếp nhóm không mắc", True, "review",
                          f"mô hình: {prediction.get('label_name')}", "kiểm tra chéo"))
        elif not model_pos and rule_risk >= 3:
            out.append(_r("V02", "Có từ 3 yếu tố nguy cơ nhưng mô hình xếp nhóm không mắc", True, "review",
                          f"{rule_risk} yếu tố nguy cơ", "kiểm tra chéo"))
    return out


def review_flags(results: list[RuleResult]) -> list[str]:
    """Auditable flags for the coordinator: one per fired lab or review rule, plus the screening advice."""
    flags = [f"{r['id']}:{r['severity']}" for r in results if r["fired"] and r["severity"] in {"lab_diabetes", "lab_prediabetes", "review"}]
    if any(r["id"] == "R06" and r["fired"] for r in results):
        flags.append("R06:screen")
    return flags


def section_text(results: list[RuleResult]) -> str:
    fired = [r for r in results if r["fired"]]
    lines = ["Đối chiếu hồ sơ với các luật sàng lọc tường minh (độc lập với mô hình học sâu):"]
    lines += [f"- **{r['id']}** {r['title']} ({r['evidence']})" for r in fired] or ["- Không luật nào kích hoạt."]
    if any(r["severity"] == "lab_diabetes" for r in fired):
        lines.append("Một chỉ số xét nghiệm nằm trong ngưỡng chẩn đoán theo ADA. Chẩn đoán chỉ được xác lập khi bác sĩ "
                     "xác nhận bằng xét nghiệm lặp lại; hãy mang kết quả này đến cơ sở y tế.")
    if any(r["severity"] == "review" for r in fired):
        lines.append("Kết quả mô hình và luật không thống nhất; nên ưu tiên xét nghiệm thực tế.")
    lines.append(f"Nguồn ngưỡng: {ADA_SOURCE}. Bộ luật {RULESET_VERSION}.")
    return "\n".join(lines)
