"""Generate LaTeX macros, tables and the retrieval figure from results/*.json.

python report/gen_tables.py          write report/generated/*
python report/gen_tables.py --check  fail if generated files differ from what results/ implies
"""

import json
import statistics
import sys
from collections import Counter
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.app.main import OUT_OF_SCOPE_MIN_COSINE  # noqa: E402
from backend.app.retrieval import EXPAND, RRF_K  # noqa: E402
from backend.app.schema import EMBEDDING_DIM  # noqa: E402
OUT = ROOT / "report" / "generated"
RES = ROOT / "results"


YEARS = {"2015": "Fifteen", "2023": "TwentyThree"}


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def num(x: float | int, d: int = 0) -> str:
    """Vietnamese number format: 1.234,56."""
    s = f"{x:,.{d}f}"
    return s.replace(",", "_").replace(".", ",").replace("_", ".")


def tex(s: str) -> str:
    return s.replace("\\", "\\textbackslash{}").replace("&", "\\&").replace("%", "\\%").replace("_", "\\_").replace("#", "\\#")


def pct(x: float, d: int = 1) -> str:
    return num(100 * x, d) + "\\%"


def pm(stat: dict, d: int = 4) -> str:
    return f"{num(stat['mean'], d)} $\\pm$ {num(stat['std'], d)}"


def build() -> dict[str, str]:
    docs = jsonl(ROOT / "data" / "processed" / "documents.jsonl")
    chunks = jsonl(ROOT / "data" / "processed" / "chunks.jsonl")
    questions = jsonl(ROOT / "eval" / "questions.jsonl")
    gold = jsonl(ROOT / "eval" / "gold.jsonl")
    graph = load(RES / "graph_stats.json")
    clf = load(RES / "classifier.json")
    ev = load(RES / "eval.json")
    manual = load(ROOT / "eval" / "manual_review.json")
    s3, dt = clf["tasks"]["status3"], clf["tasks"]["diabtype"]

    kinds = Counter((d["lang"], d["kind"]) for d in docs)
    lang_chunks = Counter(c["lang"] for c in chunks)
    tokens = [c["n_tokens"] for c in chunks]
    ex = graph["extraction"]
    a0, a2, v0, v1 = ev["answers_expand0"], ev["answers_expand2"], ev["answers_v0"], ev["answers_v1"]
    gx = ev["retrieval"]["graph_expansion"]
    m = {
        "nDocs": num(len(docs)),
        "nDocsVi": num(sum(d["lang"] == "vi" for d in docs)),
        "nDocsEn": num(sum(d["lang"] == "en" for d in docs)),
        "nHtmlVi": num(kinds["vi", "html"]),
        "nHtmlEn": num(kinds["en", "html"]),
        "nPdfVi": num(kinds["vi", "pdf"]),
        "nPdfEn": num(kinds["en", "pdf"]),
        "nPublishers": num(len({d["publisher"] for d in docs})),
        "nChunks": num(len(chunks)),
        "nChunksVi": num(lang_chunks["vi"]),
        "nChunksEn": num(lang_chunks["en"]),
        "tokMean": num(statistics.mean(tokens)),
        "tokMin": num(min(tokens)),
        "tokMax": num(max(tokens)),
        "nQuestions": num(len(questions)),
        "nInScope": num(sum(q["in_scope"] for q in questions)),
        "nOos": num(sum(not q["in_scope"] for q in questions)),
        "nQEn": num(sum(q["lang"] == "en" for q in questions)),
        "nGoldPairs": num(sum(len(g["relevant"]) for g in gold)),
        "goldMin": num(min(len(g["relevant"]) for g in gold)),
        "goldMax": num(max(len(g["relevant"]) for g in gold)),
        "poolMean": num(statistics.mean(g["pool"] for g in gold)),
        "relAgree": f"{manual['relevance_labels']['agree']}/{manual['relevance_labels']['sampled']}",
        "relAgreeLenient": f"{manual['relevance_labels_lenient']['agree_low']}--{manual['relevance_labels_lenient']['agree_high']}/{manual['relevance_labels_lenient']['sampled']}",
        "claimAgree": f"{manual['claims']['agree']}/{manual['claims']['sampled']}",
        "nFacts": num(graph["facts_with_sources"]),
        "nBilingualFacts": num(graph["facts_supported_in_both_languages"]),
        "nProposed": num(ex["proposed"]),
        "nAccepted": num(ex["accepted"]),
        "nRejQuote": num(ex["rejected"].get("quote_not_in_chunk", 0)),
        "nRejOther": num(sum(v for k, v in ex["rejected"].items() if k != "quote_not_in_chunk")),
        "extractTokens": num(ex["tokens"]),
        "nNodes": num(sum(graph["nodes"].values())),
        "nRels": num(sum(graph["relationships"].values())),
        "nSupportedBy": num(graph["relationships"]["SUPPORTED_BY"]),
        "nRowsStatus": num(s3["n_rows"]),
        "nProfilesStatus": num(s3["unique_profiles"]),
        "nRowsType": num(dt["n_rows"]),
        "nFeatures": num(len(clf["data"]["features"]["status3"]) if isinstance(clf["data"]["features"], dict) else len(clf["data"]["features"])),
        "trainSeconds": num(clf["timings_s"]["total"]),
        "predictMs": num(s3["predict_check"]["latency_ms_median"], 3),
        "tempStatus": num(s3["calibration"]["temperature"], 3),
        "tempType": num(dt["calibration"]["temperature"], 3),
        "eceStatusBefore": num(s3["calibration"]["test_before"]["ece"], 4),
        "eceStatusAfter": num(s3["calibration"]["test_after"]["ece"], 4),
        "eceTypeBefore": num(dt["calibration"]["test_before"]["ece"], 4),
        "eceTypeAfter": num(dt["calibration"]["test_after"]["ece"], 4),
        "eceStatusPrior": num(s3["calibration"]["diagnostic_test_prior_corrected"]["ece"], 4),
        "eceTypePrior": num(dt["calibration"]["diagnostic_test_prior_corrected"]["ece"], 4),
        "bestEpochStatus": num(s3["mlp_seed0_history"]["best_epoch"]),
        "epochsStatus": num(s3["mlp_seed0_history"]["epochs_run"]),
        "bestEpochType": num(dt["mlp_seed0_history"]["best_epoch"]),
        "epochsType": num(dt["mlp_seed0_history"]["epochs_run"]),
        "preTP": num(s3["seed0"]["mlp"]["confusion"][1][1]),
        "preSupport": num(s3["seed0"]["mlp"]["per_class"][1]["support"]),
        "prePrecision": num(s3["seed0"]["mlp"]["per_class"][1]["precision"], 4),
        "typeOneTP": num(dt["seed0"]["mlp"]["confusion"][0][0]),
        "typeOneSupport": num(dt["seed0"]["mlp"]["per_class"][0]["support"]),
        "typeOnePred": num(sum(row[0] for row in dt["seed0"]["mlp"]["confusion"])),
        "typeOnePrecision": num(dt["seed0"]["mlp"]["per_class"][0]["precision"], 4),
        "answeredZero": f"{a0['answered']}/{a0['in_scope']}",
        "answeredTwo": f"{a2['answered']}/{a2['in_scope']}",
        "supportedZero": pct(a0["claims_supported"]),
        "supportedTwo": pct(a2["claims_supported"]),
        "unsupportedZero": pct(a0["claims_unsupported"]),
        "unsupportedTwo": pct(a2["claims_unsupported"]),
        "claimsZero": num(a0["claims"]),
        "claimsTwo": num(a2["claims"]),
        "refusalOos": pct(a2["refusal_accuracy_oos"], 0),
        "falseRefusalTwo": pct(a2["false_refusal_in_scope"]),
        "falseRefusalZero": pct(a0["false_refusal_in_scope"]),
        "latencyP": num(a2["latency_s_p50"], 2),
        "latencyMax": num(a2["latency_s_max"], 2),
        "vZeroUnsupported": pct(v0["claims_unsupported"]),
        "vOneUnsupported": pct(v1["claims_unsupported"]),
        "vOneFalseRefusal": pct(v1["false_refusal_in_scope"]),
        "gxAdded": num(gx["chunks_added"]),
        "gxRelevant": pct(gx["relevant"]),
        "gxOther": pct(gx["other_language"]),
        "gxOutside": pct(gx["outside_vector_top10"]),
        "gxNew": num(gx["relevant_and_outside_top10"]),
        "llmModel": ev["model"],
        "uiFirstTextP": num(statistics.median(load(RES / "ui_perf.json")["first_text_ms"]) / 1000, 1),
        "rrfK": num(RRF_K),
        "expandN": num(EXPAND),
        "oosMin": num(OUT_OF_SCOPE_MIN_COSINE, 2),
        "embedDim": num(EMBEDDING_DIM),
        "nPrevalenceOther": num(s3["label_counts_by_year"]["2023"]["0"]),
    }
    for year, counts in s3["label_counts_by_year"].items():
        for code, n in counts.items():
            m[f"y{YEARS[year]}c{'ABC'[int(code)]}"] = num(n)
        m[f"y{YEARS[year]}total"] = num(sum(counts.values()))
    for code, n in dt["label_counts_by_year"]["2023"].items():
        m[f"typeCount{'ABC'[int(code)]}"] = num(n)
    macros = "".join(f"\\newcommand{{\\{k}}}{{{v}}}\n" for k, v in m.items())

    rt = ev["retrieval"]
    configs = [k for k in rt if k != "graph_expansion"]
    retr = "".join(
        f"{name} & {num(r['hit@3'], 3)} & {num(r['hit@5'], 3)} & {num(r['precision@5'], 3)} & {num(r['recall@5'], 3)} & {num(r['mrr@10'], 3)} \\\\\n"
        for name, r in ((c, rt[c]) for c in configs)
    )

    def clf_rows(task: dict) -> str:
        names = {"majority": "Luôn lớp đông nhất", "logistic": "Hồi quy logistic", "mlp": "MLP"}
        return "".join(
            f"{names[k]} & {pm(task['summary'][k]['accuracy'])} & {pm(task['summary'][k]['macro_f1'])} \\\\\n" for k in names
        )

    def per_class(task: dict) -> str:
        rows = task["seed0"]["mlp"]["per_class"]
        return "".join(
            f"{task['class_names'][str(c)]} & {num(r['precision'], 4)} & {num(r['recall'], 4)} & {num(r['f1'], 4)} & {num(r['support'])} \\\\\n"
            for c, r in zip(task["classes"], rows)
        )

    def splits(task: dict, name: str) -> str:
        sp = task["splits"]["0"]
        return "".join(
            f"{name} / {vi} & {num(sp[k]['rows'])} & {' / '.join(num(v) for v in sp[k]['per_class'].values())} \\\\\n"
            for k, vi in (("train", "huấn luyện"), ("val", "xác thực"), ("test", "kiểm tra"))
        )

    nodes = "".join(f"{k} & {num(v)} \\\\\n" for k, v in sorted(graph["nodes"].items()))
    rels = "".join(f"\\texttt{{{k.replace('_', chr(92) + '_')}}} & {num(v)} \\\\\n" for k, v in sorted(graph["relationships"].items()))
    sources = "".join(
        f"{tex(p)} & {n} \\\\\n" for p, n in sorted(Counter(d["publisher"] for d in docs).items(), key=lambda x: (-x[1], x[0]))
    )
    return {
        "macros.tex": macros,
        "table_retrieval.tex": retr,
        "table_clf_status.tex": clf_rows(s3),
        "table_clf_type.tex": clf_rows(dt),
        "table_class_status.tex": per_class(s3),
        "table_class_type.tex": per_class(dt),
        "table_splits.tex": splits(s3, "Ba nhóm") + splits(dt, "Type 1/2"),
        "table_nodes.tex": nodes,
        "table_rels.tex": rels,
        "table_sources.tex": sources,
    }


def figure(path: Path) -> None:
    rt = load(RES / "eval.json")["retrieval"]
    configs = [k for k in rt if k != "graph_expansion"]
    metrics = [("hit@3", "Hit@3"), ("precision@5", "Precision@5"), ("mrr@10", "MRR@10")]
    fig, ax = plt.subplots(figsize=(7.2, 3.2))
    width = 0.8 / len(configs)
    colors = ["#9DB8D4", "#1F4E79", "#5CA184", "#E0A458", "#B0413E"]
    for i, c in enumerate(configs):
        xs = [j + i * width for j in range(len(metrics))]
        ax.bar(xs, [rt[c][m] for m, _ in metrics], width, label=c, color=colors[i % len(colors)])
    ax.set_xticks([j + 0.4 - width / 2 for j in range(len(metrics))], [n for _, n in metrics])
    ax.set_ylim(0, 1.05)
    ax.set_ylabel("Giá trị trung bình trên 26 câu")
    ax.legend(fontsize=7, ncol=3, loc="upper center", bbox_to_anchor=(0.5, -0.12), frameon=False)
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    fig.savefig(path, dpi=200)
    plt.close(fig)


def main() -> None:
    files = build()
    OUT.mkdir(parents=True, exist_ok=True)
    if "--check" in sys.argv:
        stale = [n for n, text in files.items() if not (OUT / n).exists() or (OUT / n).read_text(encoding="utf-8") != text]
        print("stale:", stale or "none")
        sys.exit(1 if stale else 0)
    for name, text in files.items():
        (OUT / name).write_text(text, encoding="utf-8")
    figure(OUT / "retrieval_ablation.png")
    print(f"wrote {len(files)} files + figure to {OUT}")


if __name__ == "__main__":
    main()
