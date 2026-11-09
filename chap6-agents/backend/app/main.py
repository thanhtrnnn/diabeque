"""FastAPI for the multi-agent assistant.

The chat stream keeps the A8 SSE contract (sources.snapshot, answer.*, stream.*) so the A8 frontend parser still
works, and adds one event, `agent.step`, emitted as each agent finishes. `answer.final` carries an `agent` block with
the intent, profile, risk and full trace.
"""

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
from .agents import fields
from .agents.graph import app as agent_graph
from .agents.state import AGENT_LABELS, TURN_DEFAULTS, Agent
from .db import driver
from .retrieval import corpus
from .schema import DISCLAIMER, KB_ID, LABEL_TOPIC, Task

DELTA_CHARS = 48
FLAG_MESSAGES = {
    "emergency": "Phát hiện dấu hiệu khẩn cấp; luồng tư vấn đã dừng.",
    "dosage_removed": "Đã bỏ câu có liều thuốc.",
    "diagnosis_removed": "Đã bỏ câu kết luận chẩn đoán cho cá nhân.",
    "no_citation_left": "Một phần câu trả lời bị loại vì không còn trích dẫn.",
}

app = FastAPI(title="Diabeque — hệ đa agent đái tháo đường")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3200"], allow_methods=["*"], allow_headers=["*"])


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    conversation_id: str | None = None


class ClassifyRequest(BaseModel):
    task: Task
    features: dict[str, float]


@app.get("/ready")
def ready() -> dict:
    return {"chunks": len(corpus().ids), "agents": [a.value for a in Agent]}


def now() -> str:
    return datetime.now(UTC).isoformat()


def source_record(i: int, h: dict, citation_id: str | None) -> dict:
    return {
        "source_id": h["chunk_id"], "citation_id": citation_id, "chunk_id": h["chunk_id"], "document_id": h["doc_id"],
        "document_title": h["title"], "publisher": h["publisher"], "lang": h["lang"], "excerpt": h["text"][:600],
        "source_url": h["url"], "retrieval_rank": i + 1, "normalized_score": h.get("score", 0.0),
        "retrieved_by": h.get("retrieved_by", []), "role": "supporting" if citation_id else "context",
    }


def pieces(text: str, cite_ids: dict[str, str], labels: dict[str, int]) -> list[dict]:
    items = []
    for part in re.split(gen.CITE, text):
        if part in cite_ids:
            items.append({"type": "citation", "citation_id": cite_ids[part], "label": labels[part]})
        elif part:
            items.append({"type": "text", "text": part})
    return items


def answer_state(sections: list[dict]) -> str:
    kinds = {s["kind"] for s in sections}
    if "emergency" in kinds:
        return "emergency"
    if "question" in kinds:
        return "needs_info"
    if kinds & {"conclusion", "advice", "risk"}:
        return "answered"
    if any(s["title"] == "Ngoài phạm vi" for s in sections):
        return "out_of_scope"
    if any(s["title"] == "Giới thiệu" for s in sections):
        return "answered"
    return "insufficient_evidence"


def run_chat(req: ChatRequest, conversation_id: str) -> Iterator[tuple[str, dict]]:
    yield "stream.started", {"capabilities": ["inline_citations", "source_collection", "agent_trace"]}
    started = time.perf_counter()
    graph = agent_graph()
    cfg = {"configurable": {"thread_id": conversation_id}}
    seen = 0
    for update in graph.stream({**TURN_DEFAULTS, "message": req.message}, cfg, stream_mode="updates"):
        for node, delta in update.items():
            trace = (delta or {}).get("trace", [])
            for step in trace[seen:]:
                yield "agent.step", {"node": node, **step}
            seen = max(seen, len(trace))
    state = graph.get_state(cfg).values
    sources, sections = state.get("sources", []), state.get("sections", [])

    used = list(dict.fromkeys(a for s in sections for a in gen.CITE.findall(s["text"])))
    by_alias = {gen.alias(i): h for i, h in enumerate(sources)}
    used = [a for a in used if a in by_alias]
    cite_ids = {a: str(uuid.uuid4()) for a in used}
    labels = {a: n for n, a in enumerate(used, start=1)}
    yield "sources.snapshot", {"revision": 1, "sources": [source_record(i, h, None) for i, h in enumerate(sources)]}

    if used:
        basis = "\n".join(f"- {by_alias[a]['title']} ({by_alias[a]['publisher']}) [[cite:{a}]]" for a in used)
        sections = [*sections, {"kind": "basis", "title": "Căn cứ", "text": basis}]
    state_name = answer_state(sections)
    yield "answer.started", {"state": state_name, "section_order": [s["kind"] for s in sections]}
    final_sections = []
    for order, s in enumerate(sections, start=1):
        sid = f"{s['kind']}-{order}"
        yield "answer.section.started", {"section_id": sid, "kind": s["kind"], "title": s["title"], "order": order}
        content = pieces(s["text"], cite_ids, labels)
        for item in content:
            if item["type"] == "citation":
                yield "answer.citation", {"section_id": sid, "citation_id": item["citation_id"], "label": item["label"]}
            else:
                for j in range(0, len(item["text"]), DELTA_CHARS):
                    yield "answer.text.delta", {"section_id": sid, "text_delta": item["text"][j : j + DELTA_CHARS]}
        yield "answer.section.completed", {"section_id": sid}
        final_sections.append({"id": sid, "kind": s["kind"], "title": s["title"], "content": content})

    citation_of = {id(by_alias[a]): cite_ids[a] for a in used}
    citations = [{"id": cite_ids[a], "document_id": by_alias[a]["doc_id"], "chunk_id": by_alias[a]["chunk_id"],
                  "label": by_alias[a]["title"], "publisher": by_alias[a]["publisher"], "lang": by_alias[a]["lang"],
                  "excerpt": by_alias[a]["text"][:600], "source_url": by_alias[a]["url"]} for a in used]
    plain = "\n\n".join(gen.CITE.sub(lambda m: f"[{labels[m.group(1)]}]" if m.group(1) in labels else "", s["text"])
                        for s in sections if s["kind"] != "basis")
    profile = state.get("profile", {})
    yield "answer.final", {
        "answer": {
            "answer": plain,
            "sections": final_sections,
            "state": state_name,
            "confidence": 0.0,
            "evidence_state": "sufficient" if used else "insufficient",
            "citations": citations,
            "sources": [source_record(i, h, citation_of.get(id(h))) for i, h in enumerate(sources)],
            "warnings": [{"code": f, "message": FLAG_MESSAGES.get(f, f)} for f in state.get("safety_flags", [])],
            "disclaimer": DISCLAIMER,
            "topic": (state.get("risk") or {}).get("topic"),
            "latency_ms": round((time.perf_counter() - started) * 1000),
            "created_at": now(),
            "agent": {
                "intent": state.get("intent"),
                "trace": state.get("trace", []),
                "profile": [{"name": k, "label": fields.FIELD_BY_NAME[k]["label_vi"], "value": v,
                             "display": fields.describe_value(k, v)} for k, v in profile.items() if k in fields.FIELD_BY_NAME],
                "missing": state.get("missing", []),
                "risk": state.get("risk"),
                "safety_flags": state.get("safety_flags", []),
            },
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
        envelope = {"v": 1, "seq": seq, "request_id": request_id, "conversation_id": conversation_id,
                    "answer_id": answer_id, "timestamp": now(), "data": data}
        if name == "answer.final":
            data["answer"] |= {"id": answer_id, "conversation_id": conversation_id}
        return f"id: {seq}\nevent: {name}\ndata: {json.dumps(envelope, ensure_ascii=False, default=str)}\n\n"

    try:
        for name, data in run_chat(req, conversation_id):
            yield frame(name, data)
    except Exception:
        yield frame("stream.error", {"error": {"code": "INTERNAL", "message": "Lỗi xử lý, vui lòng thử lại.",
                                               "request_id": request_id, "retryable": True}, "stage": "generation"})
        raise


@app.post("/api/v1/chat/stream")
def chat_stream(req: ChatRequest) -> StreamingResponse:
    return StreamingResponse(sse(req), media_type="text/event-stream",
                             headers={"X-Chat-Stream-Version": "1", "X-Accel-Buffering": "no", "Cache-Control": "no-cache"})


@app.get("/api/v1/agents")
def agents() -> dict:
    """Agent list and the graph in Mermaid, for the architecture page."""
    return {"agents": [{"id": a.value, "label": AGENT_LABELS[a]} for a in Agent],
            "mermaid": agent_graph().get_graph().draw_mermaid()}


@app.get("/api/v1/conversations/{conversation_id}/profile")
def conversation_profile(conversation_id: str) -> dict:
    values = agent_graph().get_state({"configurable": {"thread_id": conversation_id}}).values
    return {"profile": values.get("profile", {}), "risk": values.get("risk"), "missing": fields.missing(values.get("profile", {}))}


@app.post("/api/v1/classify")
def classify(req: ClassifyRequest) -> dict:
    from .agents.tools import _predict

    return _predict(req.task, req.features)


@app.get("/api/v1/classify/features")
def classify_features() -> dict:
    from .classify import FEATURES

    return {task: f for task, f in FEATURES.items()}


@app.get("/api/v1/sources/{chunk_id:path}")
def source(chunk_id: str) -> dict:
    hit = corpus().hits.get(chunk_id)
    if not hit:
        raise HTTPException(404, "Không có đoạn nguồn này")
    h = hit.__dict__
    return source_record(0, h, None) | {"excerpt": hit.text}


@app.get("/api/v1/graph/{node_id:path}")
def graph(node_id: str, limit: int = 30) -> dict:
    with driver().session() as s:
        center = s.run("MATCH (n {kb_id: $kb, id: $id}) RETURN n, labels(n)[0] AS label", kb=KB_ID, id=node_id).single()
        if not center:
            raise HTTPException(404, "Không có nút này")
        rows = s.run(
            "MATCH (n {kb_id: $kb, id: $id})-[r]-(m) "
            "WITH type(r) AS rel, startNode(r) = n AS out, m ORDER BY m.id "
            "WITH rel, collect({out: out, m: m, label: labels(m)[0]})[..$limit] AS xs "
            "UNWIND xs AS x RETURN rel, x.out AS out, x.m AS m, x.label AS label",
            kb=KB_ID, id=node_id, limit=limit,
        ).data()

    def node(props: dict, label: str) -> dict:
        name = props.get("name_vi") or props.get("text_vi") or props.get("title") or props.get("label_vi") or props.get("id")
        if label == "Chunk":
            name = (props.get("text") or "")[:120]
        return {"id": props.get("id") or str(props.get("code")), "label": label, "name": name}

    return {"center": node(dict(center["n"]), center["label"]),
            "neighbors": [{"rel": r["rel"], "direction": "out" if r["out"] else "in", "node": node(r["m"], r["label"])} for r in rows]}


@app.get("/api/v1/topics")
def topics() -> dict:
    return {f"{task}:{label}": topic for (task, label), topic in LABEL_TOPIC.items()}
