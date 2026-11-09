import json

import pytest

from backend.app.db import driver
from pipeline import ingest_docs

pytest.importorskip("sentence_transformers")


@pytest.fixture
def sample_dir(tmp_path, monkeypatch):
    docs = [{"id": "test_doc", "title": "T", "publisher": "P", "lang": "vi", "url": "u", "kind": "html"}]
    chunks = [
        {"id": f"test_doc#{i:03d}", "doc_id": "test_doc", "ord": i, "text": f"đoạn thử {i}", "lang": "vi", "n_tokens": 4}
        for i in range(3)
    ]
    (tmp_path / "documents.jsonl").write_text("\n".join(json.dumps(d) for d in docs))
    (tmp_path / "chunks.jsonl").write_text("\n".join(json.dumps(c) for c in chunks))
    monkeypatch.setattr(ingest_docs, "PROCESSED", tmp_path)
    yield
    with driver().session() as s:
        s.run("MATCH (n) WHERE n.id = 'test_doc' OR n.doc_id = 'test_doc' DETACH DELETE n")


def count_test_graph() -> tuple[int, int]:
    with driver().session() as s:
        row = s.run(
            "MATCH (c:Chunk {doc_id: 'test_doc'})-[r:PART_OF]->(:Document {id: 'test_doc'}) RETURN count(c) AS n, count(r) AS r"
        ).single()
    return row["n"], row["r"]


def test_ingest_twice_keeps_counts(sample_dir):
    ingest_docs.main()
    first = count_test_graph()
    ingest_docs.main()
    assert first == (3, 3)
    assert count_test_graph() == (3, 3)
