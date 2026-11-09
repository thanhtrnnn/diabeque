"""Compare MLP, 1-D CNN and LSTM on the BRFSS survey tasks; save the best architecture per task to models/.

Same group split, preprocessing, class weights and early stopping as the A8 MLP, so only the architecture changes.
The architecture is chosen by mean validation macro-F1; the test set is only reported.

    python -m pipeline.train_dl                      # 3 archs x 3 seeds x 2 tasks
    python -m pipeline.train_dl --seeds 1 --max-epochs 2 --tasks diabtype   # smoke test
"""

import argparse
import json
import platform
import sys
import time
from copy import deepcopy
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import torch
from sklearn.metrics import f1_score
from torch.nn import functional as F

from backend.app import classify
from backend.app.classify import FEATURE_NAMES, MODELS_DIR
from backend.app.nets import ARCHS, build, n_params
from backend.app.schema import LABEL_NAMES, LABEL_TOPIC, Task
from pipeline.common import (SPLITS, Preprocess, calibration, class_weights, fit_temperature, group_split, load_task,
                             mean_std, scores)

ROOT = Path(__file__).resolve().parents[1]
RESULT = ROOT / "results" / "dl_compare.json"
FIGURES = ROOT / "results" / "figures"
BATCH, LR, PATIENCE = 512, 1e-3, 7
COLORS = {"mlp": "#2a78d6", "cnn1d": "#eb6834", "lstm": "#1baf7a"}
NAMES = {"mlp": "MLP", "cnn1d": "CNN-1D", "lstm": "LSTM"}


def train(arch: str, Xtr, ytr, Xva, yva, n_classes: int, seed: int, max_epochs: int) -> tuple[torch.nn.Module, dict]:
    torch.manual_seed(seed)
    gen = torch.Generator().manual_seed(seed)
    model = build(arch, Xtr.shape[1], n_classes)
    weight = class_weights(ytr, n_classes)
    xt, yt, xv, yv = map(torch.as_tensor, (Xtr, ytr, Xva, yva))
    opt = torch.optim.Adam(model.parameters(), lr=LR)
    hist = {"train_loss": [], "val_loss": [], "val_macro_f1": [], "epoch_s": []}
    best_f1, best_state, best_epoch = -1.0, None, 0
    for epoch in range(max_epochs):
        t0 = time.perf_counter()
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
        val_f1 = f1_score(yva, logits.argmax(1).numpy(), labels=list(range(n_classes)), average="macro", zero_division=0)
        hist["train_loss"].append(total / len(yt))
        hist["val_loss"].append(F.cross_entropy(logits, yv, weight=weight).item())
        hist["val_macro_f1"].append(val_f1)
        hist["epoch_s"].append(time.perf_counter() - t0)
        if val_f1 > best_f1:
            best_f1, best_state, best_epoch = val_f1, deepcopy(model.state_dict()), epoch
        elif epoch - best_epoch >= PATIENCE:
            break
    model.load_state_dict(best_state)
    model.eval()
    return model, {**hist, "best_epoch": best_epoch, "epochs_run": len(hist["val_loss"]), "best_val_macro_f1": best_f1}


def infer_ms(model: torch.nn.Module, X: np.ndarray) -> float:
    """Median latency of one-row predictions, the way the agent tool calls the model."""
    x = torch.as_tensor(X[:201])
    times = []
    with torch.no_grad():
        for i in range(len(x)):
            t0 = time.perf_counter()
            model(x[i : i + 1])
            times.append((time.perf_counter() - t0) * 1000)
    return float(np.median(times[1:]))


def save(task: Task, arch: str, model, pre: Preprocess, classes: list[int], temperature: float) -> None:
    folder = MODELS_DIR / task.value
    folder.mkdir(parents=True, exist_ok=True)
    torch.save(model.state_dict(), folder / "model.pt")
    (folder / "preprocess.json").write_text(json.dumps({
        "task": task.value, "arch": arch, "features": FEATURE_NAMES, "medians": pre.medians.tolist(),
        "means": pre.means.tolist(), "stds": pre.stds.tolist(), "temperature": temperature, "classes": classes,
    }, ensure_ascii=False, indent=1))


def plot_curves(task: Task, histories: dict[str, dict]) -> None:
    fig, axes = plt.subplots(1, 2, figsize=(9, 3.2))
    for arch, h in histories.items():
        ep = range(1, len(h["val_loss"]) + 1)
        axes[0].plot(ep, h["val_loss"], color=COLORS[arch], label=NAMES[arch])
        axes[1].plot(ep, h["val_macro_f1"], color=COLORS[arch], label=NAMES[arch])
    axes[0].set(title="Sai số xác thực", xlabel="lượt học")
    axes[1].set(title="Macro-F1 xác thực", xlabel="lượt học")
    axes[1].legend()
    fig.tight_layout()
    FIGURES.mkdir(parents=True, exist_ok=True)
    fig.savefig(FIGURES / f"dl_curves_{task.value}.png", dpi=160)
    plt.close(fig)


def run_task(task: Task, seeds: list[int], archs: list[str], max_epochs: int) -> dict:
    features, y_codes, _ = load_task(task)
    classes = [code for t, code in LABEL_TOPIC if t is task]
    y = np.searchsorted(classes, y_codes)
    K, X = len(classes), features.to_numpy()
    rows = {a: [] for a in archs}
    seed0 = {}
    for seed in seeds:
        split = group_split(features, y_codes, seed)
        idx = {name: np.flatnonzero(split == i) for i, name in enumerate(SPLITS)}
        pre = Preprocess.fit(X[idx["train"]])
        Xs = {n: pre.transform(X[ix]) for n, ix in idx.items()}
        ys = {n: y[ix] for n, ix in idx.items()}
        for arch in archs:
            t0 = time.perf_counter()
            model, hist = train(arch, Xs["train"], ys["train"], Xs["val"], ys["val"], K, seed, max_epochs)
            seconds = time.perf_counter() - t0
            with torch.no_grad():
                logits = {n: model(torch.as_tensor(Xs[n])) for n in ("val", "test")}
            res = scores(ys["test"], logits["test"].argmax(1).numpy(), K)
            row = {"seed": seed, "accuracy": res["accuracy"], "macro_f1": res["macro_f1"],
                   "val_macro_f1": hist["best_val_macro_f1"], "train_s": seconds, "epochs_run": hist["epochs_run"],
                   "best_epoch": hist["best_epoch"] + 1, "epoch_s_mean": float(np.mean(hist["epoch_s"]))}
            rows[arch].append(row)
            print(f"[{task.value}] seed {seed} {arch:6s} val F1 {row['val_macro_f1']:.4f}  test acc {row['accuracy']:.4f} "
                  f"F1 {row['macro_f1']:.4f}  epochs {row['epochs_run']}  {seconds:.0f}s", flush=True)
            if seed == seeds[0]:
                T = fit_temperature(logits["val"], torch.as_tensor(ys["val"]))
                before = calibration(F.softmax(logits["test"], 1).numpy(), ys["test"])
                after = calibration(F.softmax(logits["test"] / T, 1).numpy(), ys["test"])
                seed0[arch] = {"model": model, "pre": pre, "temperature": T, "history": hist, "scores": res,
                               "ece_before": before["ece"], "ece_after": after["ece"], "infer_ms": infer_ms(model, Xs["test"]),
                               "probe": (X[idx["test"]][:100], F.softmax(logits["test"][:100] / T, 1).numpy())}
    summary = {a: {k: mean_std([r[k] for r in rs]) if len(rs) > 1 else {"mean": rs[0][k], "std": 0.0}
                   for k in ("accuracy", "macro_f1", "val_macro_f1", "train_s")} for a, rs in rows.items()}
    best = max(archs, key=lambda a: summary[a]["val_macro_f1"]["mean"])
    chosen = seed0[best]
    save(task, best, chosen["model"], chosen["pre"], classes, chosen["temperature"])
    classify._load.cache_clear()
    diffs = [np.abs(np.array(list(classify.predict(task, dict(zip(FEATURE_NAMES, r.tolist())))["probs"].values())) - want).max()
             for r, want in zip(*chosen["probe"])]
    assert max(diffs) < 1e-4, f"saved {best} model disagrees with training run: {max(diffs)}"
    plot_curves(task, {a: s["history"] for a, s in seed0.items()})
    print(f"[{task.value}] chosen by val macro-F1: {best}", flush=True)
    return {
        "classes": classes, "class_names": {str(c): LABEL_NAMES[(task, c)] for c in classes}, "n_rows": len(y),
        "per_seed": rows, "summary": summary, "chosen": best, "saved_model_max_prob_diff": float(max(diffs)),
        "seed0": {a: {"params": n_params(s["model"]), "temperature": s["temperature"], "ece_before": s["ece_before"],
                      "ece_after": s["ece_after"], "infer_ms_median": s["infer_ms"], "best_epoch": s["history"]["best_epoch"] + 1,
                      "epochs_run": s["history"]["epochs_run"], "per_class": s["scores"]["per_class"],
                      "confusion": s["scores"]["confusion"]} for a, s in seed0.items()},
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, default=3)
    ap.add_argument("--max-epochs", type=int, default=40)
    ap.add_argument("--archs", nargs="+", default=list(ARCHS))
    ap.add_argument("--tasks", nargs="+", default=[t.value for t in Task])
    args = ap.parse_args()
    torch.set_num_threads(max(1, torch.get_num_threads()))
    t0 = time.perf_counter()
    report = {
        "env": {"python": sys.version.split()[0], "platform": platform.platform(), "torch": torch.__version__, "device": "cpu",
                "threads": torch.get_num_threads()},
        "config": {"seeds": list(range(args.seeds)), "batch": BATCH, "lr": LR, "max_epochs": args.max_epochs, "patience": PATIENCE,
                   "selection": "mean validation macro-F1", "archs": args.archs},
        "tasks": {t: run_task(Task(t), list(range(args.seeds)), args.archs, args.max_epochs) for t in args.tasks},
    }
    report["total_s"] = time.perf_counter() - t0
    RESULT.parent.mkdir(parents=True, exist_ok=True)
    RESULT.write_text(json.dumps(report, ensure_ascii=False, indent=1, default=float))
    print(f"wrote {RESULT} in {report['total_s']:.0f}s")


if __name__ == "__main__":
    main()
