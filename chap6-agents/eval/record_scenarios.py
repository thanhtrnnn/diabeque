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

KNOWLEDGE = ["safety_in", "orchestrator", "knowledge", "safety_out", "audit"]
ASK_MORE = ["safety_in", "orchestrator", "intake", "safety_out", "audit"]
FULL_RISK = ["safety_in", "orchestrator", "intake", "risk", "rules", "advisor", "safety_out", "audit"]
DIRECT = ["safety_in", "orchestrator", "safety_out", "audit"]
EMERGENCY = ["safety_in", "safety_out", "audit"]  # every turn ends in audit (graph.py)
# "Ngoài phạm vi" is reached two ways: with a live LLM the orchestrator says out_of_scope and emits the notice itself
# (nodes.py:140-141, DIRECT; eval/scenarios.yaml has this question as out_of_scope); if it says knowledge instead, the
# retrieval cosine gate rejects it (nodes.py:396-397, KNOWLEDGE). Both are legitimate, so either sequence is accepted and
# the section title pins the outcome.
OUT_OF_SCOPE_ROUTES = (DIRECT, KNOWLEDGE)
REQUIRED_TITLE = {"ngoai-pham-vi": "Ngoài phạm vi"}
# What the simulated outage must show, per turn: the agent whose fallback it expects.
OUTAGE_TURN1 = {"orchestrator": "rules", "intake": "rules"}
OUTAGE_TURN2 = {"orchestrator": "rules", "knowledge": "passages"}

# id, Vietnamese label, [(message, llm_down, allowed agent sequences, required fallbacks when llm_down)]
SCENARIOS = [
    ("kien-thuc", "Câu hỏi kiến thức", [(KNOWLEDGE_Q, False, (KNOWLEDGE,), {})]),
    ("vong-lap", "Vòng lặp thu thập hồ sơ rồi dự đoán nguy cơ", [(RISK_Q1, False, (ASK_MORE,), {}), (RISK_Q2, False, (FULL_RISK,), {})]),
    ("khan-cap", "Tình huống khẩn cấp", [("Mẹ tôi tiêm insulin xong thì lú lẫn, vã mồ hôi, gọi không trả lời", False, (EMERGENCY,), {})]),
    ("chao-hoi", "Chào hỏi", [("Xin chào, bạn làm được gì?", False, (DIRECT,), {})]),
    ("lieu-insulin", "Hỏi liều insulin (bị chặn)", [("Tôi nên tiêm bao nhiêu đơn vị insulin mỗi ngày?", False, (KNOWLEDGE,), {})]),
    ("llm-sap", "Mất kết nối LLM: luật dự phòng", [(RISK_Q1, True, (ASK_MORE,), OUTAGE_TURN1), (KNOWLEDGE_Q, True, (KNOWLEDGE,), OUTAGE_TURN2)]),
    ("ngoai-pham-vi", "Câu hỏi ngoài phạm vi", [("Giá vàng hôm nay bao nhiêu?", False, OUT_OF_SCOPE_ROUTES, {})]),
]


def check_turn(sid: str, n: int, turn: dict, llm_down: bool, allowed, required_fallbacks: dict[str, str]) -> list[str]:
    """Return every way this recorded turn differs from what the scenario must show (empty list = good)."""
    where, steps = f"{sid} turn {n}", turn["steps"]
    got = [s["agent"] for s in steps]
    problems = []
    if got not in [list(a) for a in allowed]:
        problems.append(f"{where}: expected {' or '.join(' > '.join(a) for a in allowed)}, got {' > '.join(got)}")
    fallbacks = {s["agent"]: s.get("fallback") for s in steps}
    if llm_down:
        for agent, want in required_fallbacks.items():
            if fallbacks.get(agent) != want:
                problems.append(f"{where}: {agent} fallback should be {want!r}, got {fallbacks.get(agent)!r}")
    else:  # a real run must not silently record the outage path
        fell_back = [f"{a}={f}" for a, f in fallbacks.items() if f]
        if fell_back:
            problems.append(f"{where}: unexpected fallback ({', '.join(fell_back)}); is the LLM endpoint up?")
    title = REQUIRED_TITLE.get(sid)
    if title and title not in [x["title"] for x in turn["sections"]]:
        problems.append(f"{where}: no section titled {title!r}")
    return problems


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
    scenarios, problems = [], []
    for sid, label, turns in SCENARIOS:
        thread, recorded = f"rec-{sid}-{uuid.uuid4().hex[:8]}", []
        for n, (message, llm_down, allowed, required_fallbacks) in enumerate(turns, start=1):
            turn = run_turn(graph, thread, message, llm_down)
            print(f"{sid} turn {n}: {' > '.join(s['agent'] for s in turn['steps'])}")
            problems += check_turn(sid, n, turn, llm_down, allowed, required_fallbacks)
            recorded.append(turn)
        scenarios.append({"id": sid, "label": label, "turns": recorded})
    if problems:  # report everything at once so one run shows every mismatch; nothing is written
        for p in problems:
            print(f"FAIL {p}", file=sys.stderr)
        return 1
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"recorded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "commit": git_commit(),
                               "scenarios": scenarios}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
