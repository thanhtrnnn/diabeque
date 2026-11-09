"""Train and evaluate the survey classifiers; write models/, results/figures/ and results/classifier.json."""

import json
import platform
import sqlite3
import sys
import textwrap
import time
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import sklearn
import torch
from matplotlib.colors import LinearSegmentedColormap
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_recall_fscore_support
from torch.nn import functional as F

from backend.app import classify
from backend.app.classify import FEATURE_NAMES, MODELS_DIR, build_mlp
from backend.app.schema import LABEL_NAMES, LABEL_TOPIC, Task
from pipeline.survey_sqlite import DB_PATH, describe_recode

ROOT = Path(__file__).resolve().parents[1]
FIGURES = ROOT / "results" / "figures"
RESULT = ROOT / "results" / "classifier.json"

SPLITS = ("train", "val", "test")
RATIOS = (0.70, 0.15, 0.15)
SEEDS = range(5)
SPLIT_TRIALS, BATCH, LR, MAX_EPOCHS, PATIENCE, N_BINS = 32, 512, 1e-3, 40, 7, 15
SERIES = ["#2a78d6", "#eb6834", "#1baf7a"]
INK, MUTED, SURFACE, GRID = "#0b0b0b", "#52514e", "#fcfcfb", "#e3e2de"
BLUES = LinearSegmentedColormap.from_list("blues", ["#f2f6fc", "#2a78d6", "#0d3b78"])
plt.rcParams.update({
    "figure.facecolor": SURFACE, "axes.facecolor": SURFACE, "savefig.facecolor": SURFACE, "text.color": INK,
    "axes.labelcolor": MUTED, "xtick.color": MUTED, "ytick.color": MUTED, "axes.edgecolor": GRID,
    "axes.spines.top": False, "axes.spines.right": False, "axes.grid": True, "grid.color": GRID, "axes.axisbelow": True,
    "font.size": 10, "legend.frameon": False,
})


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


def train_mlp(Xtr, ytr, Xva, yva, n_classes: int, seed: int) -> tuple[torch.nn.Module, dict]:
    torch.manual_seed(seed)
    gen = torch.Generator().manual_seed(seed)
    model = build_mlp(Xtr.shape[1], n_classes)
    weight = class_weights(ytr, n_classes)
    xt, yt, xv, yv = map(torch.as_tensor, (Xtr, ytr, Xva, yva))
    opt = torch.optim.Adam(model.parameters(), lr=LR)
    history = {"train_loss": [], "val_loss": [], "val_macro_f1": []}
    best_f1, best_state, best_epoch = -1.0, None, 0
    for epoch in range(MAX_EPOCHS):
        model.train()
        order = torch.randperm(len(yt), generator=gen)
        total = 0.0
        for i in range(0, len(order), BATCH):
            idx = order[i : i + BATCH]
            loss = F.cross_entropy(model(xt[idx]), yt[idx], weight=weight)
            opt.zero_grad()
            loss.backward()
            opt.step()
            total += loss.item() * len(idx)
        model.eval()
        with torch.no_grad():
            logits = model(xv)
            val_loss = F.cross_entropy(logits, yv, weight=weight).item()
        val_f1 = f1_score(yva, logits.argmax(1).numpy(), labels=list(range(n_classes)), average="macro", zero_division=0)
        history["train_loss"].append(total / len(yt))
        history["val_loss"].append(val_loss)
        history["val_macro_f1"].append(val_f1)
        if val_f1 > best_f1:
            best_f1, best_state, best_epoch = val_f1, deepcopy(model.state_dict()), epoch
        elif epoch - best_epoch >= PATIENCE:
            break
    model.load_state_dict(best_state)
    model.eval()
    return model, {**history, "best_epoch": best_epoch, "epochs_run": len(history["val_loss"])}


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


def class_name(task: Task, code: int, width: int = 16) -> str:
    return textwrap.fill(LABEL_NAMES[(task, code)], width)


def save_fig(fig, name: str) -> None:
    FIGURES.mkdir(parents=True, exist_ok=True)
    fig.savefig(FIGURES / name, dpi=150, bbox_inches="tight")
    plt.close(fig)


def plot_label_distribution(data: dict) -> None:
    fig, axes = plt.subplots(1, 2, figsize=(11, 4.2), gridspec_kw={"width_ratios": [3, 2]})
    feats3, y3, years3 = data[Task.STATUS3]
    classes = np.unique(y3)
    for k, year in enumerate(sorted(set(years3))):
        counts = np.array([((y3 == c) & (years3 == year)).sum() for c in classes])
        share = counts / counts.sum() * 100
        x = np.arange(len(classes)) + (k - 0.5) * 0.38
        bars = axes[0].bar(x, share, 0.36, color=SERIES[k], label=f"BRFSS {year} (n = {counts.sum():,})")
        for b, s, n in zip(bars, share, counts):
            axes[0].text(b.get_x() + b.get_width() / 2, s + 1, f"{s:.1f}%\n{n:,}", ha="center", fontsize=8, color=INK)
    axes[0].set_xticks(range(len(classes)), [class_name(Task.STATUS3, int(c)) for c in classes])
    axes[0].set(ylabel="Tỷ lệ hồ sơ trong năm (%)", xlabel="Nhóm tình trạng", ylim=(0, 100), title="Ba nhóm tình trạng theo năm khảo sát")
    axes[0].legend(loc="upper right")
    _, yt, _ = data[Task.DIABTYPE]
    classes = np.unique(yt)
    counts = np.array([(yt == c).sum() for c in classes])
    bars = axes[1].bar(range(len(classes)), counts, 0.5, color=SERIES[0])
    for b, n in zip(bars, counts):
        axes[1].text(b.get_x() + b.get_width() / 2, n + counts.max() * 0.01, f"{n:,}\n({n / counts.sum() * 100:.1f}%)", ha="center", fontsize=8)
    axes[1].set_xticks(range(len(classes)), [class_name(Task.DIABTYPE, int(c)) for c in classes])
    axes[1].set(ylabel="Số hồ sơ", xlabel="Loại đái tháo đường", ylim=(0, counts.max() * 1.18), title="Type 1 và Type 2 (BRFSS 2023)")
    save_fig(fig, "label_distribution.png")


def plot_learning_curves(task: Task, hist: dict) -> None:
    fig, axes = plt.subplots(1, 2, figsize=(10, 3.8))
    epochs = np.arange(1, len(hist["train_loss"]) + 1)
    axes[0].plot(epochs, hist["train_loss"], color=SERIES[0], lw=2, label="Huấn luyện")
    axes[0].plot(epochs, hist["val_loss"], color=SERIES[1], lw=2, label="Xác thực")
    axes[0].set(xlabel="Lượt huấn luyện", ylabel="Mất mát (cross entropy có trọng số)", title="Đường mất mát")
    axes[1].plot(epochs, hist["val_macro_f1"], color=SERIES[0], lw=2, label="Macro-F1 xác thực")
    for ax in axes:
        ax.axvline(hist["best_epoch"] + 1, color=MUTED, ls="--", lw=1, label=f"Lượt được chọn ({hist['best_epoch'] + 1})")
        ax.legend()
    axes[1].set(xlabel="Lượt huấn luyện", ylabel="Macro-F1", title="Macro-F1 trên tập xác thực")
    save_fig(fig, f"learning_curves_{task.value}.png")


def plot_confusion(task: Task, classes: list[int], matrices: dict[str, list]) -> None:
    fig, axes = plt.subplots(1, len(matrices), figsize=(5.4 * len(matrices), 4.6), sharey=True, layout="constrained")
    names = [class_name(task, c, 12) for c in classes]
    for ax, (title, cm) in zip(axes, matrices.items()):
        cm = np.array(cm)
        norm = cm / cm.sum(1, keepdims=True)
        ax.imshow(norm, cmap=BLUES, vmin=0, vmax=1)
        ax.grid(False)
        for i in range(len(classes)):
            for j in range(len(classes)):
                ax.text(j, i, f"{cm[i, j]:,}\n{norm[i, j] * 100:.1f}%", ha="center", va="center", fontsize=8,
                        color="white" if norm[i, j] > 0.4 else INK)
        ax.set_xticks(range(len(classes)), names)
        ax.set_yticks(range(len(classes)), names)
        ax.set(xlabel="Nhãn dự đoán", title=title)
    axes[0].set_ylabel("Nhãn thực")
    save_fig(fig, f"confusion_{task.value}.png")


def plot_calibration(task: Task, before: dict, after: dict) -> None:
    fig, ax = plt.subplots(figsize=(4.8, 4.4))
    ax.plot([0, 1], [0, 1], color=MUTED, ls="--", lw=1, label="Hiệu chỉnh hoàn hảo")
    for cal, color, name in ((before, SERIES[0], "Trước"), (after, SERIES[1], "Sau")):
        ax.plot([b["confidence"] for b in cal["bins"]], [b["accuracy"] for b in cal["bins"]], "o-", color=color, lw=2, ms=6,
                label=f"{name} khi chia nhiệt độ (ECE = {cal['ece']:.3f})")
    ax.set(xlabel="Độ tin cậy dự đoán", ylabel="Độ chính xác thực tế", xlim=(0, 1), ylim=(0, 1), title="Biểu đồ độ tin cậy (tập kiểm tra)")
    ax.legend(loc="upper left", fontsize=8)
    save_fig(fig, f"calibration_{task.value}.png")


def run_task(task: Task, features: pd.DataFrame, y_codes: np.ndarray, years: np.ndarray) -> dict:
    classes = [code for t, code in LABEL_TOPIC if t is task]
    assert sorted(classes) == sorted(np.unique(y_codes).tolist()), "data labels differ from schema labels"
    y = np.searchsorted(classes, y_codes)
    K = len(classes)
    X = features.to_numpy()
    out = {
        "classes": classes,
        "class_names": {str(c): LABEL_NAMES[(task, c)] for c in classes},
        "n_rows": len(y),
        "unique_profiles": int(len(features.drop_duplicates())),
        "label_counts_by_year": {str(yr): {str(c): int(((years == yr) & (y_codes == c)).sum()) for c in classes} for yr in sorted(set(years))},
        "splits": {}, "per_seed": {}, "timings_s": {},
    }
    per_seed = {m: [] for m in ("majority", "logistic", "mlp")}
    seed0 = {}
    for seed in SEEDS:
        t0 = time.perf_counter()
        split = group_split(features, y_codes, seed)
        t_split = time.perf_counter() - t0
        idx = {name: np.flatnonzero(split == i) for i, name in enumerate(SPLITS)}
        out["splits"][str(seed)] = {
            name: {"rows": len(ix), "per_class": {str(c): int((y[ix] == i).sum()) for i, c in enumerate(classes)}} for name, ix in idx.items()
        }
        pre = Preprocess.fit(X[idx["train"]])
        Xs = {name: pre.transform(X[ix]) for name, ix in idx.items()}
        ys = {name: y[ix] for name, ix in idx.items()}
        timing = {"split": t_split}

        majority = np.bincount(ys["train"], minlength=K).argmax()
        results = {"majority": scores(ys["test"], np.full(len(ys["test"]), majority), K)}

        t0 = time.perf_counter()
        logreg = LogisticRegression(class_weight="balanced", max_iter=1000).fit(Xs["train"], ys["train"])
        results["logistic"] = scores(ys["test"], logreg.predict(Xs["test"]), K)
        timing["logistic"] = time.perf_counter() - t0

        t0 = time.perf_counter()
        model, hist = train_mlp(Xs["train"], ys["train"], Xs["val"], ys["val"], K, seed)
        timing["mlp"] = time.perf_counter() - t0
        with torch.no_grad():
            logits = {name: model(torch.as_tensor(Xs[name])) for name in ("val", "test")}
        results["mlp"] = scores(ys["test"], logits["test"].argmax(1).numpy(), K)
        results["mlp"]["best_epoch"], results["mlp"]["epochs_run"] = hist["best_epoch"], hist["epochs_run"]

        for name, res in results.items():
            per_seed[name].append({"seed": seed, "accuracy": res["accuracy"], "macro_f1": res["macro_f1"]})
        out["timings_s"][str(seed)] = timing
        print(f"[{task.value}] seed {seed}: " + "  ".join(f"{m} acc {r['accuracy']:.4f} f1 {r['macro_f1']:.4f}" for m, r in results.items())
              + f"  mlp epochs {hist['epochs_run']} best {hist['best_epoch'] + 1}  {timing['mlp']:.0f}s", flush=True)

        if seed == 0:
            seed0 = results
            temperature = fit_temperature(logits["val"], torch.as_tensor(ys["val"]))
            test_y = ys["test"]
            before = calibration(F.softmax(logits["test"], 1).numpy(), test_y)
            after = calibration(F.softmax(logits["test"] / temperature, 1).numpy(), test_y)
            undo_weights = F.softmax(logits["test"] / temperature, 1) / class_weights(ys["train"], K)
            prior_corrected = calibration((undo_weights / undo_weights.sum(1, keepdim=True)).numpy(), test_y)
            out["calibration"] = {"temperature": temperature, "bins": N_BINS, "test_before": before, "test_after": after,
                                  "diagnostic_test_prior_corrected": prior_corrected}
            print(f"[{task.value}] T = {temperature:.3f}  ECE {before['ece']:.4f} -> {after['ece']:.4f}  NLL {before['nll']:.4f} -> {after['nll']:.4f}  prior-corrected ECE {prior_corrected['ece']:.4f}", flush=True)
            save_mlp(task, model, pre, classes, temperature, len(idx["train"]))
            out["mlp_seed0_history"] = hist
            plot_learning_curves(task, hist)
            plot_confusion(task, classes, {"Hồi quy logistic": results["logistic"]["confusion"], "MLP": results["mlp"]["confusion"]})
            plot_calibration(task, before, after)
            probe = (X[idx["test"]][:200], F.softmax(logits["test"][:200] / temperature, 1).numpy())

    out["per_seed"] = per_seed
    out["summary"] = {m: {k: mean_std([r[k] for r in rows]) for k in ("accuracy", "macro_f1")} for m, rows in per_seed.items()}
    out["seed0"] = seed0
    out["predict_check"] = check_saved_model(task, features.columns, *probe)
    return out


def save_mlp(task: Task, model, pre: Preprocess, classes: list[int], temperature: float, n_train: int) -> None:
    folder = MODELS_DIR / task.value
    folder.mkdir(parents=True, exist_ok=True)
    torch.save(model.state_dict(), folder / "model.pt")
    (folder / "preprocess.json").write_text(json.dumps({
        "task": task.value, "features": FEATURE_NAMES, "medians": pre.medians.tolist(), "means": pre.means.tolist(),
        "stds": pre.stds.tolist(), "temperature": temperature, "classes": classes, "n_train": n_train,
    }, ensure_ascii=False, indent=1))


def check_saved_model(task: Task, columns, rows: np.ndarray, expected: np.ndarray) -> dict:
    """The saved artefacts, loaded through classify.predict, must reproduce the in-memory calibrated probabilities."""
    classify._load.cache_clear()
    diffs, times = [], []
    for row, want in zip(rows, expected):
        t0 = time.perf_counter()
        got = classify.predict(task, dict(zip(columns, row.tolist())))
        times.append((time.perf_counter() - t0) * 1000)
        diffs.append(np.abs(np.array(list(got["probs"].values())) - want).max())
    assert max(diffs) < 1e-4, f"classify.predict disagrees with training run: {max(diffs)}"
    return {"rows": len(rows), "max_abs_prob_diff": float(max(diffs)),
            "latency_ms_median": float(np.median(times[1:])), "latency_ms_p95": float(np.percentile(times[1:], 95)),
            "first_call_ms": times[0]}


def feature_shift(features: pd.DataFrame, years: np.ndarray) -> dict:
    return {str(yr): {"mean": features[years == yr].mean().round(4).to_dict(), "missing_rate": features[years == yr].isna().mean().round(4).to_dict()}
            for yr in sorted(set(years))}


def main() -> None:
    t_start = time.perf_counter()
    data = {task: load_task(task) for task in Task}
    t_load = time.perf_counter() - t_start
    plot_label_distribution(data)
    report = {
        "env": {"python": sys.version.split()[0], "platform": platform.platform(), "torch": torch.__version__, "sklearn": sklearn.__version__,
                "pandas": pd.__version__, "numpy": np.__version__, "device": "cpu", "torch_threads": torch.get_num_threads()},
        "config": {"seeds": list(SEEDS), "ratios": dict(zip(SPLITS, RATIOS)), "split_trials": SPLIT_TRIALS, "batch": BATCH, "lr": LR,
                   "max_epochs": MAX_EPOCHS, "patience": PATIENCE, "ece_bins": N_BINS, "std": "sample std, ddof=1",
                   "split_per_seed": "the group split is redrawn per seed, so std includes split variance"},
        "data": {"features": FEATURE_NAMES, "excluded_from_2015": ["Fruits", "Veggies"], "recode_2023": describe_recode(),
                 "feature_shift_status3": feature_shift(data[Task.STATUS3][0], data[Task.STATUS3][2])},
        "tasks": {},
    }
    for task, (features, y_codes, years) in data.items():
        report["tasks"][task.value] = run_task(task, features, y_codes, years)
    report["timings_s"] = {"load": t_load, "total": time.perf_counter() - t_start}
    RESULT.parent.mkdir(parents=True, exist_ok=True)
    RESULT.write_text(json.dumps(report, ensure_ascii=False, indent=1, default=float))
    print(f"wrote {RESULT} in {report['timings_s']['total']:.0f}s")


if __name__ == "__main__":
    main()
