import json

import pytest

from backend.app.classify import FEATURES, MODELS_DIR, predict
from backend.app.schema import LABEL_NAMES, LABEL_TOPIC, Task

HIGH_RISK = {
    "HighBP": 1, "HighChol": 1, "CholCheck": 1, "BMI": 40, "Smoker": 1, "Stroke": 0, "HeartDiseaseorAttack": 0,
    "PhysActivity": 0, "HvyAlcoholConsump": 0, "AnyHealthcare": 1, "NoDocbcCost": 0, "GenHlth": 5, "MentHlth": 18,
    "PhysHlth": 15, "DiffWalk": 1, "Sex": 0, "Age": 9, "Education": 4, "Income": 3,
}
LOW_RISK = {
    "HighBP": 0, "HighChol": 0, "CholCheck": 1, "BMI": 22, "Smoker": 0, "Stroke": 0, "HeartDiseaseorAttack": 0,
    "PhysActivity": 1, "HvyAlcoholConsump": 0, "AnyHealthcare": 1, "NoDocbcCost": 0, "GenHlth": 1, "MentHlth": 0,
    "PhysHlth": 0, "DiffWalk": 0, "Sex": 1, "Age": 2, "Education": 6, "Income": 8,
}
ALLOWED = {Task.STATUS3: {0, 1, 2}, Task.DIABTYPE: {1, 2}}


@pytest.mark.parametrize("task", list(Task))
def test_prediction_is_a_valid_calibrated_distribution_with_matching_topic(task):
    result = predict(task, HIGH_RISK)
    assert abs(sum(result["probs"].values()) - 1) < 1e-6
    assert set(result["probs"]) == ALLOWED[task]
    assert result["label"] in ALLOWED[task]
    assert result["label"] == max(result["probs"], key=result["probs"].get)
    assert result["topic"] == LABEL_TOPIC[(task, result["label"])]
    assert result["label_name"] == LABEL_NAMES[(task, result["label"])]


def test_status3_ranks_high_risk_profile_above_low_risk_profile():
    high, low = predict(Task.STATUS3, HIGH_RISK), predict(Task.STATUS3, LOW_RISK)
    assert high["label"] == 2 and high["probs"][2] > 0.5
    assert low["label"] == 0 and low["probs"][2] < 0.1


@pytest.mark.parametrize("task", list(Task))
def test_missing_features_equal_median_imputation(task):
    pre = json.loads((MODELS_DIR / task.value / "preprocess.json").read_text())
    medians = dict(zip(pre["features"], pre["medians"]))
    partial = {"BMI": 40, "Age": 9}
    explicit = predict(task, medians | partial)
    imputed = predict(task, partial)
    nan_marked = predict(task, partial | {"HighBP": float("nan")})
    assert imputed["probs"] == pytest.approx(explicit["probs"], abs=1e-6)
    assert nan_marked["probs"] == pytest.approx(predict(task, partial | {"HighBP": medians["HighBP"]})["probs"], abs=1e-6)


def test_unknown_feature_and_out_of_range_value_are_rejected():
    with pytest.raises(ValueError, match="unknown features"):
        predict(Task.STATUS3, {"Shoe": 1})
    with pytest.raises(ValueError, match="BMI=500"):
        predict(Task.STATUS3, {"BMI": 500})


@pytest.mark.parametrize("task", list(Task))
def test_form_fields_match_the_trained_feature_order(task):
    pre = json.loads((MODELS_DIR / task.value / "preprocess.json").read_text())
    assert [f["name"] for f in FEATURES[task]] == pre["features"]
    assert all(f["min"] < f["max"] and f["label_vi"] and f["kind"] in {"binary", "ordinal", "number"} for f in FEATURES[task])
