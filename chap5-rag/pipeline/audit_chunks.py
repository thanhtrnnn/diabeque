import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
OUT = ROOT / "results" / "chunk_audit.md"
SAMPLE, SEED = 30, 0


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def main() -> None:
    docs = {d["id"]: d for d in read_jsonl(PROCESSED / "documents.jsonl")}
    chunks = read_jsonl(PROCESSED / "chunks.jsonl")
    picked = random.Random(SEED).sample(chunks, SAMPLE)
    lines = [f"# Chunk audit\n\n{SAMPLE} chunks drawn with seed {SEED} from {len(chunks)} chunks in {len(docs)} documents.\n"]
    for i, c in enumerate(picked, 1):
        d = docs[c["doc_id"]]
        lines.append(f"## {i}. {c['id']}\n\n{d['publisher']} | {c['lang']} | {c['n_tokens']} tokens | {d['title']}\n\n```text\n{c['text']}\n```\n")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {OUT} ({SAMPLE} of {len(chunks)} chunks)")


if __name__ == "__main__":
    main()
