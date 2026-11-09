"""LLM fact extraction with code-verified quotes, merged into KB_diabet as SUPPORTED_BY-linked facts."""

import argparse
import json
import re
import unicodedata
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import yaml

from backend.app.answer import client
from backend.app.config import settings
from backend.app.db import driver
from backend.app.schema import DISEASES, FACT_KINDS, KB_ID, Label, Rel

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
RAW_OUT = PROCESSED / "facts_raw.jsonl"
REJECTED = ROOT / "results" / "facts_rejected.jsonl"
STATS = ROOT / "results" / "graph_stats.json"
SYNONYMS = Path(__file__).with_name("synonyms.yaml")

PROMPT = """Trích các dữ kiện y tế về đái tháo đường có trong ĐOẠN dưới đây. Chỉ lấy điều đoạn văn nói rõ.
Loại dữ kiện (kind): symptom (triệu chứng, dấu hiệu nhận biết bệnh), complication (biến chứng, hậu quả lâu dài hoặc cấp tính), risk_factor (yếu tố nguy cơ), recommendation (khuyến nghị ăn uống, vận động, theo dõi, phòng ngừa), drug_class (nhóm thuốc).
disease là một trong: {diseases}. Dùng dtd_chung khi đoạn không nói rõ loại.
Trả về JSON duy nhất, không giải thích:
{{"facts": [{{"kind": "...", "disease": "...", "key_vi": "tên ngắn tiếng Việt, tối đa 6 từ, viết thường",
"text_vi": "câu khuyến nghị đầy đủ bằng tiếng Việt (chỉ với recommendation, còn lại để null)",
"condition": "điều kiện áp dụng nếu đoạn nêu, nếu không thì null",
"quote": "trích NGUYÊN VĂN một câu hoặc cụm từ trong đoạn, đúng ngôn ngữ gốc, làm bằng chứng"}}]}}
Không có dữ kiện thì trả {{"facts": []}}. Tối đa 6 dữ kiện.

ĐOẠN ({lang}):
{text}"""


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", s)).strip().lower()


def slug(s: str) -> str:
    s = unicodedata.normalize("NFD", s.replace("đ", "d").replace("Đ", "D"))
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")[:60]


def parse_json(raw: str) -> dict:
    match = re.search(r"\{.*\}", raw, re.S)
    return json.loads(match.group(0)) if match else {"facts": []}


def ask(chunk: dict) -> dict:
    prompt = PROMPT.format(diseases=", ".join(DISEASES), lang=chunk["lang"], text=chunk["text"])
    try:
        response = client().chat.completions.create(
            model=settings().model_name,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            max_tokens=1200,
        )
        facts = parse_json(response.choices[0].message.content or "").get("facts", [])
        usage = response.usage.total_tokens if response.usage else 0
    except (json.JSONDecodeError, Exception) as exc:  # noqa: BLE001 - one bad chunk must not stop the run
        return {"chunk_id": chunk["id"], "facts": [], "error": type(exc).__name__, "tokens": 0}
    return {"chunk_id": chunk["id"], "facts": facts, "tokens": usage}


def verify(fact: dict, chunk_text: str, canonical: dict[str, str]) -> tuple[dict | None, str]:
    if fact.get("kind") not in FACT_KINDS:
        return None, "unknown_kind"
    if fact.get("disease") not in DISEASES:
        return None, "unknown_disease"
    quote, key = fact.get("quote") or "", norm(fact.get("key_vi") or "")
    if len(norm(quote)) < 4 or norm(quote) not in norm(chunk_text):
        return None, "quote_not_in_chunk"
    if not key:
        return None, "missing_key"
    key = canonical.get(key, key)
    if fact["kind"] == "recommendation" and not fact.get("text_vi"):
        return None, "missing_text"
    return {**fact, "key_vi": key, "id": f"{fact['kind']}_{slug(key)}", "quote": quote.strip()}, ""


def load_canonical() -> dict[str, str]:
    groups = yaml.safe_load(SYNONYMS.read_text(encoding="utf-8")) if SYNONYMS.exists() else {}
    return {norm(alt): norm(canon) for canon, alts in (groups or {}).items() for alt in alts}


def extract(chunks: list[dict], workers: int) -> list[dict]:
    done = {}
    if RAW_OUT.exists():
        done = {r["chunk_id"]: r for r in map(json.loads, RAW_OUT.read_text(encoding="utf-8").splitlines()) if "error" not in r}
    todo = [c for c in chunks if c["id"] not in done]
    print(f"extract: {len(done)} cached, {len(todo)} to ask", flush=True)
    with ThreadPoolExecutor(workers) as pool, RAW_OUT.open("a", encoding="utf-8") as out:
        for i, result in enumerate(pool.map(ask, todo), start=1):
            out.write(json.dumps(result, ensure_ascii=False) + "\n")
            done[result["chunk_id"]] = result
            if i % 25 == 0:
                print(f"{i}/{len(todo)}", flush=True)
    return [done[c["id"]] for c in chunks if c["id"] in done]


def load(verified: list[tuple[dict, str]]) -> None:
    with driver().session() as s:
        for kind, (label, rel) in FACT_KINDS.items():
            rows = [{"fact": f, "chunk_id": cid} for f, cid in verified if f["kind"] == kind]
            if not rows:
                continue
            name_prop = "text_vi" if label is Label.RECOMMENDATION else "name_vi"
            s.run(
                f"""
                UNWIND $rows AS r
                MERGE (f:{label} {{id: r.fact.id}})
                SET f.kb_id = $kb, f.key_vi = r.fact.key_vi,
                    f.{name_prop} = coalesce(f.{name_prop}, r.fact.{'text_vi' if name_prop == 'text_vi' else 'key_vi'}),
                    f.condition = coalesce(f.condition, r.fact.condition)
                WITH f, r
                MATCH (d:Disease {{id: r.fact.disease}}), (c:Chunk {{id: r.chunk_id}})
                MERGE (d)-[:{rel}]->(f)
                MERGE (f)-[sb:{Rel.SUPPORTED_BY}]->(c)
                SET sb.quote = r.fact.quote
                """,
                rows=rows,
                kb=KB_ID,
            )


def graph_stats() -> dict:
    with driver().session() as s:
        nodes = s.run("MATCH (n {kb_id: $kb}) RETURN labels(n)[0] AS k, count(*) AS n ORDER BY k", kb=KB_ID).data()
        rels = s.run("MATCH (a {kb_id: $kb})-[r]->(b {kb_id: $kb}) RETURN type(r) AS k, count(*) AS n ORDER BY k", kb=KB_ID).data()
        cross = s.run(
            "MATCH (f)-[:SUPPORTED_BY]->(c:Chunk) WITH f, collect(DISTINCT c.lang) AS langs "
            "RETURN count(*) AS facts, sum(CASE WHEN size(langs) > 1 THEN 1 ELSE 0 END) AS bilingual"
        ).single()
    return {
        "nodes": {r["k"]: r["n"] for r in nodes},
        "relationships": {r["k"]: r["n"] for r in rels},
        "facts_with_sources": cross["facts"],
        "facts_supported_in_both_languages": cross["bilingual"],
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int)
    ap.add_argument("--workers", type=int, default=8)
    args = ap.parse_args()
    chunks = [json.loads(line) for line in (PROCESSED / "chunks.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
    chunks = chunks[: args.limit] if args.limit else chunks
    text_of = {c["id"]: c["text"] for c in chunks}
    canonical = load_canonical()

    results = extract(chunks, args.workers)
    verified, reasons = [], Counter()
    REJECTED.parent.mkdir(exist_ok=True)
    with REJECTED.open("w", encoding="utf-8") as rej:
        for r in results:
            for fact in r["facts"]:
                ok, reason = verify(fact, text_of[r["chunk_id"]], canonical)
                if ok:
                    verified.append((ok, r["chunk_id"]))
                else:
                    reasons[reason] += 1
                    rej.write(json.dumps({"chunk_id": r["chunk_id"], "reason": reason, "fact": fact}, ensure_ascii=False) + "\n")
    load(verified)
    stats = graph_stats() | {
        "extraction": {
            "chunks": len(results),
            "llm_errors": sum("error" in r for r in results),
            "proposed": sum(len(r["facts"]) for r in results),
            "accepted": len(verified),
            "rejected": dict(reasons),
            "tokens": sum(r.get("tokens", 0) for r in results),
        }
    }
    STATS.write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(stats, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
