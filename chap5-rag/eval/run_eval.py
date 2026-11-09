"""Retrieval ablation and grounded-answer evaluation for KB_diabet.

Steps (each cached, rerunnable):
  label    pool top-20 chunks of every branch per question, LLM judges relevance -> eval/gold.jsonl
  retrieval  Hit@k, Precision@k, capped Recall@k, MRR@10 for four branch configurations
  answers  run the real chat pipeline, judge every claim against its cited source, check refusals
"""

import argparse
import json
import re
import statistics
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path

from backend.app import answer as gen
from backend.app.config import settings
from backend.app.main import ChatRequest, run_chat
from backend.app import retrieval
from backend.app.retrieval import bm25_search, corpus, graph_search, retrieve, vector_search
from backend.app.embedding import embed
from backend.app.schema import AnswerState

ROOT = Path(__file__).resolve().parents[1]
QUESTIONS = ROOT / "eval" / "questions.jsonl"
GOLD = ROOT / "eval" / "gold.jsonl"
OUT = ROOT / "results" / "eval.json"
CONFIGS = {
    "BM25": ("bm25",),
    "Vector": ("vector",),
    "BM25 + Vector": ("bm25", "vector"),
    "Vector + Graph": ("vector", "graph"),
    "BM25 + Vector + Graph": ("bm25", "vector", "graph"),
}
KS = (3, 5)


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def llm_json(prompt: str) -> dict:
    response = gen.client().chat.completions.create(
        model=settings().model_name, messages=[{"role": "user", "content": prompt}], temperature=0, max_tokens=1500
    )
    match = re.search(r"\{.*\}", response.choices[0].message.content or "", re.S)
    return json.loads(match.group(0)) if match else {}


JUDGE_RELEVANCE = """Câu hỏi: {q}
Đoạn văn ({lang}):
{text}

Đoạn văn có chứa câu TRẢ LỜI TRỰC TIẾP cho câu hỏi không? Chỉ tính khi đoạn nêu rõ nội dung được hỏi
(ví dụ hỏi triệu chứng thì đoạn phải liệt kê triệu chứng). Nhắc tới chủ đề, số liệu dịch tễ hay nội dung lân cận thì không tính.
Nếu có, trích NGUYÊN VĂN câu trong đoạn trả lời câu hỏi.
Trả JSON: {{"relevant": true hoặc false, "quote": "câu trích nguyên văn hoặc null"}}"""


def normspace(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip().lower()


def judged_relevant(verdict: dict, text: str) -> bool:
    quote = verdict.get("quote") or ""
    return verdict.get("relevant") is True and len(normspace(quote)) >= 10 and normspace(quote) in normspace(text)


def metrics(gold: set[str], ranked: list[str]) -> dict:
    out = {}
    for k in KS:
        top = ranked[:k]
        hit = len(gold & set(top))
        out[f"hit@{k}"] = float(hit > 0)
        out[f"precision@{k}"] = hit / k
        out[f"recall@{k}"] = hit / min(len(gold), k)
    out["mrr@10"] = next((1 / r for r, cid in enumerate(ranked[:10], start=1) if cid in gold), 0.0)
    return out


def label(questions: list[dict]) -> None:
    done = {g["qid"] for g in read_jsonl(GOLD)} if GOLD.exists() else set()
    hits = corpus().hits
    for q in questions:
        if q["qid"] in done or not q["in_scope"]:
            continue
        seeds = bm25_search(q["question"]) + [cid for cid, _ in vector_search(embed([q["question"]])[0])]
        pool = list(dict.fromkeys(seeds + graph_search(seeds[:10], None)))
        with ThreadPoolExecutor(8) as ex:
            verdicts = list(ex.map(lambda cid: llm_json(JUDGE_RELEVANCE.format(q=q["question"], lang=hits[cid].lang, text=hits[cid].text)), pool))
        relevant = [cid for cid, v in zip(pool, verdicts) if judged_relevant(v, hits[cid].text)]
        with GOLD.open("a", encoding="utf-8") as f:
            f.write(json.dumps({"qid": q["qid"], "pool": len(pool), "relevant": relevant}, ensure_ascii=False) + "\n")
        print(q["qid"], f"{len(relevant)}/{len(pool)} relevant", flush=True)


def eval_retrieval(questions: list[dict]) -> dict:
    gold = {g["qid"]: set(g["relevant"]) for g in read_jsonl(GOLD)}
    scored = [q for q in questions if q["in_scope"] and gold.get(q["qid"])]
    table = {}
    for name, branches in CONFIGS.items():
        rows, latencies = [], []
        for q in scored:
            t = time.perf_counter()
            ranked = [h.chunk_id for h in retrieve(q["question"], k=10, branches=branches, expand=0).hits]
            latencies.append((time.perf_counter() - t) * 1000)
            rows.append(metrics(gold[q["qid"]], ranked))
        table[name] = {m: round(statistics.mean(r[m] for r in rows), 4) for m in rows[0]} | {
            "latency_ms_p50": round(statistics.median(latencies), 1),
            "n": len(rows),
        }
    table["graph_expansion"] = eval_expansion(scored, gold)
    return table


def eval_expansion(scored: list[dict], gold: dict[str, set[str]]) -> dict:
    """Chunks the graph appends after the vector top-5: are they relevant, new, in the other language?"""
    added = []
    for q in scored:
        hits = retrieve(q["question"]).hits
        top10 = {h.chunk_id for h in retrieve(q["question"], k=10, expand=0).hits}
        for h in (h for h in hits if h.retrieved_by == ["graph"]):
            added.append({
                "relevant": h.chunk_id in gold[q["qid"]],
                "outside_vector_top10": h.chunk_id not in top10,
                "other_language": h.lang != q["lang"],
            })
    share = lambda key: round(sum(a[key] for a in added) / max(len(added), 1), 4)  # noqa: E731
    return {
        "questions": len(scored),
        "chunks_added": len(added),
        "relevant": share("relevant"),
        "outside_vector_top10": share("outside_vector_top10"),
        "other_language": share("other_language"),
        "relevant_and_outside_top10": sum(a["relevant"] and a["outside_vector_top10"] for a in added),
    }


JUDGE_CLAIMS = """Dưới đây là một câu trả lời có dấu trích dẫn [n] và các nguồn được trích.
Tách câu trả lời thành các phát biểu đơn. Với mỗi phát biểu, xét nguồn mà nó trích:
- "supported": nguồn nói đúng điều đó
- "partial": nguồn chỉ hỗ trợ một phần hoặc phát biểu thêm chi tiết không có trong nguồn
- "unsupported": nguồn không nói điều đó hoặc nói ngược lại
Trả JSON: {{"claims": [{{"claim": "...", "cites": [n], "verdict": "supported|partial|unsupported"}}]}}

CÂU TRẢ LỜI:
{answer}

NGUỒN:
{sources}"""


def eval_answers(questions: list[dict]) -> dict:
    records = []
    for q in questions:
        t = time.perf_counter()
        events = list(run_chat(ChatRequest(message=q["question"])))
        latency = time.perf_counter() - t
        final = next(d["answer"] for name, d in events if name == "answer.final")
        record = {"qid": q["qid"], "in_scope": q["in_scope"], "state": final["state"], "latency_s": round(latency, 2), "answer": final["answer"]}
        if final["state"] == AnswerState.ANSWERED:
            sources = "\n\n".join(f"[{i}] {corpus().hits[c['chunk_id']].text}" for i, c in enumerate(final["citations"], start=1))
            record["claims"] = llm_json(JUDGE_CLAIMS.format(answer=final["answer"], sources=sources)).get("claims", [])
        records.append(record)
        print(q["qid"], final["state"], f"{latency:.1f}s", flush=True)

    in_scope = [r for r in records if r["in_scope"]]
    oos = [r for r in records if not r["in_scope"]]
    claims = [c for r in in_scope for c in r.get("claims", [])]
    share = lambda v: round(sum(c.get("verdict") == v for c in claims) / max(len(claims), 1), 4)  # noqa: E731
    return {
        "answered": sum(r["state"] == AnswerState.ANSWERED for r in in_scope),
        "in_scope": len(in_scope),
        "claims": len(claims),
        "claims_supported": share("supported"),
        "claims_partial": share("partial"),
        "claims_unsupported": share("unsupported"),
        "refusal_accuracy_oos": round(sum(r["state"] != AnswerState.ANSWERED for r in oos) / max(len(oos), 1), 4),
        "false_refusal_in_scope": round(sum(r["state"] != AnswerState.ANSWERED for r in in_scope) / max(len(in_scope), 1), 4),
        "latency_s_p50": round(statistics.median(r["latency_s"] for r in records), 2),
        "latency_s_max": round(max(r["latency_s"] for r in records), 2),
        "records": records,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("steps", nargs="*", default=["label", "retrieval", "answers"])
    ap.add_argument("--expand", type=int, default=retrieval.EXPAND)
    args = ap.parse_args()
    questions = read_jsonl(QUESTIONS)
    result = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    if "label" in args.steps:
        label(questions)
    if "retrieval" in args.steps:
        result["retrieval"] = eval_retrieval(questions)
        print(json.dumps(result["retrieval"], ensure_ascii=False, indent=2))
    if "answers" in args.steps:
        retrieval.EXPAND = args.expand
        key = f"answers_expand{args.expand}"
        result[key] = eval_answers(questions)
        print(json.dumps({k: v for k, v in result[key].items() if k != "records"}, ensure_ascii=False, indent=2))
    result["run_at"] = datetime.now(UTC).isoformat()
    result["model"] = settings().model_name
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
