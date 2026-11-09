"""Minimal SSE client for the chat API: `python -m eval.client "câu hỏi" ["câu tiếp" ...]`."""

import json
import sys
import uuid

import httpx

API = "http://localhost:8200/api/v1/chat/stream"


def ask(message: str, conversation_id: str, api: str = API) -> tuple[dict, list[dict]]:
    """Send one message; return the final answer and the agent.step events in arrival order."""
    steps, final, event = [], None, None
    with httpx.stream("POST", api, json={"message": message, "conversation_id": conversation_id}, timeout=180) as r:
        for line in r.iter_lines():
            if line.startswith("event: "):
                event = line[7:]
            elif line.startswith("data: "):
                data = json.loads(line[6:])["data"]
                if event == "agent.step":
                    steps.append(data)
                elif event == "answer.final":
                    final = data["answer"]
                elif event == "stream.error":
                    raise RuntimeError(data["error"]["message"])
    return final, steps


def main() -> None:
    cid = str(uuid.uuid4())
    for msg in sys.argv[1:]:
        final, steps = ask(msg, cid)
        print(f"\n=== {msg}\nstate: {final['state']}  latency: {final['latency_ms']} ms  flags: {final['warnings']}")
        for s in steps:
            print(f"  > {s['label']}: {s['summary']} {[t['name'] for t in s['tools']]} {s['ms']} ms")
        print("  profile:", {p["name"]: p["display"] for p in final["agent"]["profile"]})
        print("  " + final["answer"].replace("\n", "\n  "))


if __name__ == "__main__":
    main()
