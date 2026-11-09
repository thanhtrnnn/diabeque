"""Hybrid retrieval over KB_diabet: BM25 + Neo4j vector index + graph expansion, fused with RRF."""

import re
from dataclasses import dataclass, field
from functools import lru_cache

import bm25s

from .db import driver
from .embedding import embed
from .schema import KB_ID, TOPIC_DISEASE, VECTOR_INDEX, Topic

RRF_K = 60
POOL = 20
Branch = str  # "bm25" | "vector" | "graph"
BRANCHES: tuple[Branch, ...] = ("bm25", "vector", "graph")
# Measured in eval/run_eval.py: vector alone ranks best; graph as an RRF ranker lowered MRR@10.
DEFAULT_BRANCHES: tuple[Branch, ...] = ("vector",)
EXPAND = 2

TOPIC_PATTERNS: dict[Topic, re.Pattern] = {
    Topic.TYPE1: re.compile(r"type\s*1|t[íý]p\s*1|tuýp\s*1|loại\s*1", re.I),
    Topic.TYPE2: re.compile(r"type\s*2|t[íý]p\s*2|tuýp\s*2|loại\s*2", re.I),
    Topic.PREDIABETES: re.compile(r"tiền\s*(đái tháo đường|tiểu đường|đtđ)|prediabetes", re.I),
}


@dataclass
class Hit:
    chunk_id: str
    doc_id: str
    text: str
    lang: str
    title: str
    publisher: str
    url: str
    score: float = 0.0
    retrieved_by: list[Branch] = field(default_factory=list)
    facts: list[str] = field(default_factory=list)


def tokenize(text: str) -> list[str]:
    return re.findall(r"\w+", text.lower())


@dataclass
class Corpus:
    hits: dict[str, Hit]
    ids: list[str]
    bm25: bm25s.BM25


@lru_cache
def corpus() -> Corpus:
    with driver().session() as s:
        rows = s.run(
            "MATCH (c:Chunk {kb_id: $kb})-[:PART_OF]->(d:Document) "
            "RETURN c.id AS id, c.doc_id AS doc_id, c.text AS text, c.lang AS lang, "
            "d.title AS title, d.publisher AS publisher, d.url AS url ORDER BY c.id",
            kb=KB_ID,
        ).data()
    hits = {r["id"]: Hit(chunk_id=r["id"], **{k: r[k] or "" for k in r if k != "id"}) for r in rows}
    ids = list(hits)
    index = bm25s.BM25()
    index.index([tokenize(hits[i].text) for i in ids], show_progress=False)
    return Corpus(hits, ids, index)


def detect_topic(query: str) -> Topic | None:
    return next((t for t, p in TOPIC_PATTERNS.items() if p.search(query)), None)


def bm25_search(query: str, k: int = POOL) -> list[str]:
    c = corpus()
    tokens = tokenize(query)
    if not tokens:
        return []
    docs, scores = c.bm25.retrieve([tokens], k=min(k, len(c.ids)), show_progress=False)
    return [c.ids[i] for i, sc in zip(docs[0], scores[0]) if sc > 0]


def vector_search(qvec: list[float], k: int = POOL) -> list[tuple[str, float]]:
    with driver().session() as s:
        rows = s.run(
            "CALL db.index.vector.queryNodes($index, $k, $v) YIELD node, score "
            "RETURN node.id AS id, score",
            index=VECTOR_INDEX,
            k=k,
            v=qvec,
        ).data()
    return [(r["id"], r["score"]) for r in rows]


def graph_search(seeds: list[str], topic: Topic | None, k: int = POOL) -> list[str]:
    """Chunks that support the same facts as the seed chunks, plus chunks behind the topic's disease facts."""
    with driver().session() as s:
        rows = s.run(
            """
            CALL {
              MATCH (seed:Chunk)<-[:SUPPORTED_BY]-(f)-[:SUPPORTED_BY]->(c:Chunk)
              WHERE seed.id IN $seeds AND NOT c.id IN $seeds
              RETURN c.id AS id, count(DISTINCT f) AS w
              UNION ALL
              MATCH (:Disease {id: $disease})-->(f)-[:SUPPORTED_BY]->(c:Chunk)
              RETURN c.id AS id, count(DISTINCT f) AS w
            }
            RETURN id, sum(w) AS weight ORDER BY weight DESC, id LIMIT $k
            """,
            seeds=seeds,
            disease=TOPIC_DISEASE.get(topic, "") if topic else "",
            k=k,
        ).data()
    return [r["id"] for r in rows]


def facts_for(chunk_ids: list[str]) -> dict[str, list[str]]:
    with driver().session() as s:
        rows = s.run(
            "MATCH (d:Disease)-->(f)-[:SUPPORTED_BY]->(c:Chunk) WHERE c.id IN $ids "
            "RETURN c.id AS id, collect(DISTINCT labels(f)[0] + ': ' + coalesce(f.name_vi, f.text_vi) "
            "+ coalesce(' (điều kiện: ' + f.condition + ')', '') + ' [' + d.name_vi + ']') AS facts",
            ids=chunk_ids,
        ).data()
    return {r["id"]: r["facts"] for r in rows}


def rrf(rankings: dict[Branch, list[str]]) -> list[tuple[str, float, list[Branch]]]:
    scores: dict[str, float] = {}
    sources: dict[str, list[Branch]] = {}
    for branch, ids in rankings.items():
        for rank, cid in enumerate(ids, start=1):
            scores[cid] = scores.get(cid, 0.0) + 1.0 / (RRF_K + rank)
            sources.setdefault(cid, []).append(branch)
    return sorted(((cid, sc, sources[cid]) for cid, sc in scores.items()), key=lambda x: (-x[1], x[0]))


@dataclass
class Retrieval:
    hits: list[Hit]
    topic: Topic | None
    top_vector_score: float


def retrieve(
    query: str,
    topic: Topic | None = None,
    k: int = 5,
    branches: tuple[Branch, ...] = DEFAULT_BRANCHES,
    expand: int | None = None,
) -> Retrieval:
    """Rank with `branches`, then append up to `expand` graph-linked chunks after the top k."""
    topic = topic or detect_topic(query)
    expand = EXPAND if expand is None else expand
    vector = vector_search(embed([query])[0])
    rankings: dict[Branch, list[str]] = {}
    if "bm25" in branches:
        rankings["bm25"] = bm25_search(query)
    if "vector" in branches:
        rankings["vector"] = [cid for cid, _ in vector]
    if "graph" in branches:
        seeds = list(dict.fromkeys(rankings.get("vector", [])[:5] + rankings.get("bm25", [])[:5]))
        rankings["graph"] = graph_search(seeds, topic)
    fused = rrf(rankings)[:k]
    if expand:
        ranked = [cid for cid, _, _ in fused]
        extra = [cid for cid in graph_search(ranked[:3], topic) if cid not in ranked][:expand]
        fused += [(cid, 0.0, ["graph"]) for cid in extra]
    pool = corpus().hits
    facts = facts_for([cid for cid, _, _ in fused])
    hits = [
        Hit(**{**pool[cid].__dict__, "score": sc, "retrieved_by": by, "facts": facts.get(cid, [])})
        for cid, sc, by in fused
        if cid in pool
    ]
    return Retrieval(hits, topic, vector[0][1] if vector else 0.0)
