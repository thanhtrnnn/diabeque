import json
import time
from pathlib import Path

from backend.app.db import driver, ensure_schema
from backend.app.embedding import embed
from backend.app.schema import DISEASES, KB_ID

PROCESSED = Path(__file__).resolve().parents[1] / "data" / "processed"
BATCH = 64


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def main() -> None:
    ensure_schema()
    documents = read_jsonl(PROCESSED / "documents.jsonl")
    chunks = read_jsonl(PROCESSED / "chunks.jsonl")
    started = time.perf_counter()
    with driver().session() as session:
        session.run(
            "UNWIND $rows AS r MERGE (d:Disease {id: r.id}) SET d += r.props, d.kb_id = $kb",
            rows=[{"id": k, "props": v} for k, v in DISEASES.items()],
            kb=KB_ID,
        )
        session.run(
            "UNWIND $rows AS r MERGE (d:Document {id: r.id}) SET d += r, d.kb_id = $kb",
            rows=documents,
            kb=KB_ID,
        )
        for i in range(0, len(chunks), BATCH):
            batch = chunks[i : i + BATCH]
            vectors = embed([c["text"] for c in batch])
            session.run(
                """
                UNWIND $rows AS r
                MERGE (c:Chunk {id: r.id})
                SET c += r.props, c.kb_id = $kb
                WITH c, r
                CALL db.create.setNodeVectorProperty(c, 'embedding', r.embedding)
                WITH c, r
                MATCH (d:Document {id: r.props.doc_id})
                MERGE (c)-[:PART_OF]->(d)
                """,
                rows=[{"id": c["id"], "props": c, "embedding": v} for c, v in zip(batch, vectors)],
                kb=KB_ID,
            )
            print(f"{min(i + BATCH, len(chunks))}/{len(chunks)} chunks", flush=True)
        counts = session.run(
            "MATCH (n {kb_id: $kb}) RETURN labels(n)[0] AS label, count(*) AS n ORDER BY label", kb=KB_ID
        ).data()
    print(json.dumps({"seconds": round(time.perf_counter() - started, 1), "counts": counts}, ensure_ascii=False))


if __name__ == "__main__":
    main()
