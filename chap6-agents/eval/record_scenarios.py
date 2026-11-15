"""Record the factory page's offline scenarios from real runs of the graph (real LLM + Neo4j).

    python -m eval.record_scenarios      # writes frontend/src/lib/factory/scenarios.json

The three.js factory page replays these traces when the network fails, so every scenario is checked
against the agent sequence it must produce; the script exits non-zero naming the first one that differs.
"""

import json
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

from langgraph.checkpoint.memory import InMemorySaver

from backend.app.agents.graph import build
from backend.app.agents.state import TURN_DEFAULTS

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "frontend" / "src" / "lib" / "factory" / "scenarios.json"

KNOWLEDGE_Q = "HbA1c bao nhiêu thì được chẩn đoán đái tháo đường?"
RISK_Q1 = "Tôi 52 tuổi, nam, cao 1m65, nặng 80kg, bị huyết áp cao. Tôi có nguy cơ tiểu đường không?"
RISK_Q2 = "Mỡ máu bình thường, tôi ít vận động, sức khỏe chung trung bình"

KNOWLEDGE = ["safety_in", "orchestrator", "knowledge", "safety_out"]
ASK_MORE = ["safety_in", "orchestrator", "intake", "safety_out"]
FULL_RISK = ["safety_in", "orchestrator", "intake", "risk", "advisor", "safety_out"]
DIRECT = ["safety_in", "orchestrator", "safety_out"]
# "Ngoài phạm vi" is reached two ways: the orchestrator LLM says out_of_scope (nodes.py orchestrator, DIRECT), or it says
# knowledge and the retrieval cosine gate rejects the question (nodes.py knowledge, tools.py OUT_OF_SCOPE_MIN_COSINE).
# The real gemma run takes the second route, so that is the recorded sequence; the section title pins the outcome.
REQUIRED_TITLE = {"ngoai-pham-vi": "Ngoài phạm vi"}

# id, Vietnamese label, [(message, llm_down, expected agent sequence)]
SCENARIOS = [
    ("kien-thuc", "Câu hỏi kiến thức", [(KNOWLEDGE_Q, False, KNOWLEDGE)]),
    ("vong-lap", "Vòng lặp thu thập hồ sơ rồi dự đoán nguy cơ", [(RISK_Q1, False, ASK_MORE), (RISK_Q2, False, FULL_RISK)]),
    ("khan-cap", "Tình huống khẩn cấp", [("Mẹ tôi tiêm insulin xong thì lú lẫn, vã mồ hôi, gọi không trả lời", False, ["safety_in", "safety_out"])]),
    ("chao-hoi", "Chào hỏi", [("Xin chào, bạn làm được gì?", False, DIRECT)]),
    ("lieu-insulin", "Hỏi liều insulin (bị chặn)", [("Tôi nên tiêm bao nhiêu đơn vị insulin mỗi ngày?", False, KNOWLEDGE)]),
    ("llm-sap", "Mất kết nối LLM: luật dự phòng", [(RISK_Q1, True, ASK_MORE), (KNOWLEDGE_Q, True, KNOWLEDGE)]),
    ("ngoai-pham-vi", "Câu hỏi ngoài phạm vi", [("Giá vàng hôm nay bao nhiêu?", False, KNOWLEDGE)]),
]


def git_commit() -> str | None:
    try:
        out = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT.parent, capture_output=True, text=True, timeout=5, check=True)
    except (OSError, subprocess.SubprocessError):
        return None
    return out.stdout.strip() or None


def run_turn(graph, thread: str, message: str, llm_down: bool) -> dict:
    state = graph.invoke({**TURN_DEFAULTS, "message": message, "llm_down": llm_down}, {"configurable": {"thread_id": thread}})
    return {"message": message, "steps": state["trace"],
            "sections": [{"kind": s["kind"], "title": s["title"], "text": s["text"]} for s in state["sections"]]}


def main() -> int:
    graph = build(InMemorySaver())
    scenarios = []
    for sid, label, turns in SCENARIOS:
        thread, recorded = f"rec-{sid}-{uuid.uuid4().hex[:8]}", []
        for n, (message, llm_down, expected) in enumerate(turns, start=1):
            turn = run_turn(graph, thread, message, llm_down)
            got = [s["agent"] for s in turn["steps"]]
            print(f"{sid} turn {n}: {' > '.join(got)}")
            if got != expected:
                print(f"FAIL {sid} turn {n}: expected {' > '.join(expected)}, got {' > '.join(got)}", file=sys.stderr)
                return 1
            fell_back = [f"{x['agent']}={x['fallback']}" for x in turn["steps"] if x.get("fallback")]
            if fell_back and not llm_down:  # a real run must not silently record the outage path
                print(f"FAIL {sid} turn {n}: unexpected fallback ({', '.join(fell_back)}); is the LLM endpoint up?", file=sys.stderr)
                return 1
            title = REQUIRED_TITLE.get(sid)
            if title and title not in [x["title"] for x in turn["sections"]]:
                print(f"FAIL {sid} turn {n}: no section titled {title!r}", file=sys.stderr)
                return 1
            recorded.append(turn)
        scenarios.append({"id": sid, "label": label, "turns": recorded})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"recorded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "commit": git_commit(),
                               "scenarios": scenarios}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
