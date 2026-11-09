import json
import re
import time
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from . import answer as gen
from .db import driver
from .retrieval import Hit, corpus, retrieve
from .schema import DISCLAIMER, KB_ID, LABEL_TOPIC, AnswerState, Task, Topic

OUT_OF_SCOPE_MIN_COSINE = 0.78
DELTA_CHARS = 48

app = FastAPI(title="KB_diabet RAG")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3100"], allow_methods=["*"], allow_headers=["*"])


class ChatRequest(BaseModel):
    message: str = Field(min_length=2, max_length=2000)
    conversation_id: str | None = None
    topic: Topic | None = None


class ClassifyRequest(BaseModel):
    task: Task
    features: dict[str, float]


@app.get("/ready")
def ready() -> dict:
    return {"chunks": len(corpus().ids)}


def now() -> str:
    return datetime.now(UTC).isoformat()


def source_record(i: int, h: Hit, citation_id: str | None) -> dict:
    return {
        "source_id": h.chunk_id,
        "citation_id": citation_id,
        "chunk_id": h.chunk_id,
        "document_id": h.doc_id,
        "document_title": h.title,
        "publisher": h.publisher,
        "lang": h.lang,
        "excerpt": h.text[:600],
        "source_url": h.url,
        "retrieval_rank": i + 1,
        "normalized_score": round(h.score, 5),
        "retrieved_by": h.retrieved_by,
        "role": "supporting" if citation_id else "context",
    }


def pieces(text: str, cite_ids: dict[str, str]) -> list[dict]:
    """Split gated text into text/citation content items in reading order."""
    items, labels = [], {a: n for n, a in enumerate(cite_ids, start=1)}
    for part in re.split(gen.CITE, text):
        if part in cite_ids:
            items.append({"type": "citation", "citation_id": cite_ids[part], "label": labels[part]})
        elif part:
            items.append({"type": "text", "text": part})
    return items


def run_chat(req: ChatRequest) -> Iterator[tuple[str, dict]]:
    yield "stream.started", {"capabilities": ["inline_citations", "source_collection"]}
    started = time.perf_counter()
    r = retrieve(req.message, req.topic)
    out_of_scope = r.top_vector_score < OUT_OF_SCOPE_MIN_COSINE or not r.hits
    hits = [] if out_of_scope else r.hits
    yield "sources.snapshot", {"revision": 1, "sources": [source_record(i, h, None) for i, h in enumerate(hits)]}

    if out_of_scope:
        gated = gen.Gated("", AnswerState.OUT_OF_SCOPE, [])
    else:
        gated = gen.gate("".join(gen.stream_answer(req.message, hits)), len(hits))

    cite_ids = {a: str(uuid.uuid4()) for a in gated.used}
    by_alias = {gen.alias(i): h for i, h in enumerate(hits)}
    if gated.state is AnswerState.ANSWERED:
        basis = "\n".join(f"- {by_alias[a].title} ({by_alias[a].publisher}) [[cite:{a}]]" for a in gated.used)
        sections = [("conclusion", "Trả lời", gated.text), ("basis", "Căn cứ", basis)]
    else:
        message = {
            AnswerState.OUT_OF_SCOPE: "Câu hỏi nằm ngoài phạm vi tra cứu về đái tháo đường của hệ thống.",
            AnswerState.INSUFFICIENT_EVIDENCE: "Chưa tìm thấy bằng chứng trong kho tài liệu để trả lời câu hỏi này.",
        }[gated.state]
        sections = [("notice", "Thông báo", message)]

    yield "answer.started", {"state": gated.state, "section_order": [k for k, _, _ in sections]}
    final_sections = []
    for order, (kind, title, text) in enumerate(sections, start=1):
        yield "answer.section.started", {"section_id": kind, "kind": kind, "title": title, "order": order}
        content = pieces(text, cite_ids)
        for item in content:
            if item["type"] == "citation":
                yield "answer.citation", {"section_id": kind, "citation_id": item["citation_id"], "label": item["label"]}
            else:
                for j in range(0, len(item["text"]), DELTA_CHARS):
                    yield "answer.text.delta", {"section_id": kind, "text_delta": item["text"][j : j + DELTA_CHARS]}
        yield "answer.section.completed", {"section_id": kind}
        final_sections.append({"id": kind, "kind": kind, "title": title, "content": content})

    sources = [source_record(i, h, next((cite_ids[a] for a in gated.used if by_alias[a] is h), None)) for i, h in enumerate(hits)]
    citations = [
        {
            "id": cite_ids[a],
            "document_id": by_alias[a].doc_id,
            "chunk_id": by_alias[a].chunk_id,
            "label": by_alias[a].title,
            "publisher": by_alias[a].publisher,
            "lang": by_alias[a].lang,
            "excerpt": by_alias[a].text[:600],
            "source_url": by_alias[a].url,
        }
        for a in gated.used
    ]
    plain = gen.CITE.sub(lambda m: f"[{list(cite_ids).index(m.group(1)) + 1}]", gated.text) if gated.used else sections[0][2]
    yield "answer.final", {
        "answer": {
            "answer": plain,
            "sections": final_sections,
            "state": gated.state,
            "confidence": round(min(1.0, r.top_vector_score), 3),
            "evidence_state": "sufficient" if gated.state is AnswerState.ANSWERED else "insufficient",
            "citations": citations,
            "sources": sources,
            "warnings": [],
            "disclaimer": DISCLAIMER,
            "topic": r.topic,
            "latency_ms": round((time.perf_counter() - started) * 1000),
            "created_at": now(),
        }
    }
    yield "stream.completed", {"finish_reason": "stop"}


def sse(req: ChatRequest) -> Iterator[str]:
    request_id, answer_id = str(uuid.uuid4()), str(uuid.uuid4())
    conversation_id = req.conversation_id or str(uuid.uuid4())
    seq = 0

    def frame(name: str, data: dict) -> str:
        nonlocal seq
        seq += 1
        envelope = {
            "v": 1,
            "seq": seq,
            "request_id": request_id,
            "conversation_id": conversation_id,
            "answer_id": answer_id,
            "timestamp": now(),
            "data": data,
        }
        if name == "answer.final":
            data["answer"] |= {"id": answer_id, "conversation_id": conversation_id}
        return f"id: {seq}\nevent: {name}\ndata: {json.dumps(envelope, ensure_ascii=False)}\n\n"

    try:
        for name, data in run_chat(req):
            yield frame(name, data)
    except Exception:
        yield frame(
            "stream.error",
            {
                "error": {"code": "INTERNAL", "message": "Lỗi xử lý, vui lòng thử lại.", "request_id": request_id, "retryable": True},
                "stage": "generation",
            },
        )
        raise


@app.post("/api/v1/chat/stream")
def chat_stream(req: ChatRequest) -> StreamingResponse:
    return StreamingResponse(
        sse(req),
        media_type="text/event-stream",
        headers={"X-Chat-Stream-Version": "1", "X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )


@app.post("/api/v1/classify")
def classify(req: ClassifyRequest) -> dict:
    from .classify import predict

    return predict(req.task, req.features)


@app.get("/api/v1/classify/features")
def classify_features() -> dict:
    from .classify import FEATURES

    return {task: fields for task, fields in FEATURES.items()}


@app.get("/api/v1/sources/{chunk_id:path}")
def source(chunk_id: str) -> dict:
    hit = corpus().hits.get(chunk_id)
    if not hit:
        raise HTTPException(404, "Không có đoạn nguồn này")
    return source_record(0, hit, None) | {"excerpt": hit.text}


@app.get("/api/v1/graph/{node_id:path}")
def graph(node_id: str, limit: int = 30) -> dict:
    """Neighbors of one node, at most `limit` per relation type so every type stays visible."""
    with driver().session() as s:
        center = s.run("MATCH (n {kb_id: $kb, id: $id}) RETURN n, labels(n)[0] AS label", kb=KB_ID, id=node_id).single()
        if not center:
            raise HTTPException(404, "Không có nút này")
        rows = s.run(
            "MATCH (n {kb_id: $kb, id: $id})-[r]-(m) "
            "WITH type(r) AS rel, startNode(r) = n AS out, m ORDER BY m.id "
            "WITH rel, collect({out: out, m: m, label: labels(m)[0]})[..$limit] AS xs "
            "UNWIND xs AS x RETURN rel, x.out AS out, x.m AS m, x.label AS label",
            kb=KB_ID,
            id=node_id,
            limit=limit,
        ).data()

    def node(props: dict, label: str) -> dict:
        name = props.get("name_vi") or props.get("text_vi") or props.get("title") or props.get("label_vi") or props.get("id")
        if label == "Chunk":
            name = (props.get("text") or "")[:120]
        return {"id": props.get("id") or str(props.get("code")), "label": label, "name": name}

    return {
        "center": node(dict(center["n"]), center["label"]),
        "neighbors": [{"rel": r["rel"], "direction": "out" if r["out"] else "in", "node": node(r["m"], r["label"])} for r in rows],
    }


@app.get("/api/v1/topics")
def topics() -> dict:
    return {f"{task}:{label}": topic for (task, label), topic in LABEL_TOPIC.items()}
