import numpy as np
import pandas as pd

from pipeline.train import Preprocess, group_split


def duplicated_profiles() -> tuple[pd.DataFrame, np.ndarray]:
    ids = np.arange(60)
    profiles = pd.DataFrame({"a": ids, "b": ids % 5, "c": np.where(ids % 7 == 0, np.nan, 1.0)})
    frame = profiles.loc[profiles.index.repeat(1 + ids % 5)].reset_index(drop=True)
    return frame, np.arange(len(frame)) % 3


def test_no_profile_in_two_splits():
    frame, y = duplicated_profiles()
    for seed in range(5):
        split = group_split(frame, y, seed)
        spans = frame.fillna(-1).assign(split=split).groupby(["a", "b", "c"]).split.nunique()
        assert len(frame) == 180
        assert len(spans) == 60
        assert spans.max() == 1


def test_split_uses_all_three_splits_near_target_ratio():
    frame, y = duplicated_profiles()
    split = group_split(frame, y, seed=0)
    shares = np.bincount(split, minlength=3) / len(split)
    assert set(split) == {0, 1, 2}
    assert 0.55 < shares[0] < 0.85
    assert shares[1] > 0.05 and shares[2] > 0.05


def test_split_is_deterministic_per_seed():
    frame, y = duplicated_profiles()
    assert (group_split(frame, y, 3) == group_split(frame, y, 3)).all()


def test_preprocess_imputes_median_then_standardises_with_train_statistics():
    pre = Preprocess.fit(np.array([[1.0, 10.0], [3.0, np.nan], [5.0, 30.0]]))
    assert pre.medians.tolist() == [3.0, 20.0]
    assert pre.means.tolist() == [3.0, 20.0]
    out = pre.transform(np.array([[np.nan, np.nan], [5.0, 30.0]]))
    assert out[0].tolist() == [0.0, 0.0]
    assert np.allclose(out[1], [2 / np.sqrt(8 / 3), 10 / np.sqrt(200 / 3)], atol=1e-6)
