"""Data split, preprocessing, metrics and calibration shared by the training scripts (copied from A8 train.py)."""

import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_recall_fscore_support
from torch.nn import functional as F

from backend.app.classify import FEATURE_NAMES
from backend.app.schema import Task

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "survey.db"
SPLITS = ("train", "val", "test")
RATIOS = (0.70, 0.15, 0.15)
SPLIT_TRIALS, N_BINS = 32, 15


def load_task(task: Task) -> tuple[pd.DataFrame, np.ndarray, np.ndarray]:
    with sqlite3.connect(DB_PATH) as con:
        rows = con.execute(
            "SELECT year, status, features_json FROM survey_records WHERE task = ? ORDER BY record_id", (task.value,)
        ).fetchall()
    years = np.array([r[0] for r in rows])
    y = np.array([r[1] for r in rows])
    features = pd.DataFrame([json.loads(r[2]) for r in rows])[FEATURE_NAMES].astype(float)
    return features, y, years


def group_split(features: pd.DataFrame, y: np.ndarray, seed: int, trials: int = SPLIT_TRIALS, ratios=RATIOS) -> np.ndarray:
    """Split id per row. Rows sharing a feature profile always share a split; the best of `trials` seeded assignments wins."""
    groups = features.groupby(list(features.columns), dropna=False, sort=False).ngroup().to_numpy()
    classes = np.unique(y)
    per_group = np.zeros((groups.max() + 1, len(classes)))
    np.add.at(per_group, (groups, np.searchsorted(classes, y)), 1)
    target = np.array(ratios)[:, None]
    rng = np.random.default_rng(seed)
    best, best_gap = None, np.inf
    for _ in range(trials):
        assign = rng.choice(len(ratios), size=len(per_group), p=ratios)
        share = np.stack([per_group[assign == s].sum(0) for s in range(len(ratios))]) / per_group.sum(0)
        gap = np.abs(share - target).sum()
        if gap < best_gap:
            best, best_gap = assign, gap
    split = best[groups]
    assert (pd.Series(split).groupby(groups).nunique() == 1).all(), "a feature profile spans two splits"
    return split


@dataclass(frozen=True)
class Preprocess:
    medians: np.ndarray
    means: np.ndarray
    stds: np.ndarray

    @classmethod
    def fit(cls, X: np.ndarray) -> "Preprocess":
        medians = np.nanmedian(X, axis=0)
        filled = np.where(np.isnan(X), medians, X)
        stds = filled.std(axis=0)
        return cls(medians, filled.mean(axis=0), np.where(stds == 0, 1.0, stds))

    def transform(self, X: np.ndarray) -> np.ndarray:
        return ((np.where(np.isnan(X), self.medians, X) - self.means) / self.stds).astype(np.float32)


def scores(y_true: np.ndarray, y_pred: np.ndarray, n_classes: int) -> dict:
    labels = list(range(n_classes))
    p, r, f, s = precision_recall_fscore_support(y_true, y_pred, labels=labels, zero_division=0)
    return {
        "accuracy": accuracy_score(y_true, y_pred),
        "macro_f1": f1_score(y_true, y_pred, labels=labels, average="macro", zero_division=0),
        "per_class": [{"precision": p[i], "recall": r[i], "f1": f[i], "support": int(s[i])} for i in labels],
        "confusion": confusion_matrix(y_true, y_pred, labels=labels).tolist(),
    }


def class_weights(y: np.ndarray, n_classes: int) -> torch.Tensor:
    return torch.tensor(len(y) / (n_classes * np.bincount(y, minlength=n_classes)), dtype=torch.float32)


def fit_temperature(logits: torch.Tensor, y: torch.Tensor) -> float:
    log_t = torch.zeros(1, requires_grad=True)
    opt = torch.optim.LBFGS([log_t], lr=0.1, max_iter=200, line_search_fn="strong_wolfe")

    def closure():
        opt.zero_grad()
        loss = F.cross_entropy(logits / log_t.exp(), y)
        loss.backward()
        return loss

    opt.step(closure)
    return log_t.exp().item()


def calibration(probs: np.ndarray, y: np.ndarray) -> dict:
    conf, hit = probs.max(1), probs.argmax(1) == y
    bin_of = np.digitize(conf, np.linspace(0, 1, N_BINS + 1)[1:-1])
    bins, ece = [], 0.0
    for b in range(N_BINS):
        m = bin_of == b
        if m.any():
            gap = abs(hit[m].mean() - conf[m].mean())
            ece += m.mean() * gap
            bins.append({"bin": b, "n": int(m.sum()), "confidence": conf[m].mean(), "accuracy": hit[m].mean()})
    nll = float(-np.log(np.clip(probs[np.arange(len(y)), y], 1e-12, None)).mean())
    return {"ece": ece, "nll": nll, "bins": bins}


def mean_std(values: list[float]) -> dict:
    return {"mean": float(np.mean(values)), "std": float(np.std(values, ddof=1))}


