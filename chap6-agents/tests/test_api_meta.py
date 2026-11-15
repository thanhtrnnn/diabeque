"""API metadata and error frames, with the agent graph stubbed so no LLM, Neo4j or model is needed."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app import main


class FakeGraph:
    def __init__(self, error=None):
        self.error, self.inputs = error, []

    def stream(self, state, cfg, stream_mode=None):
        self.inputs.append(state)
        if self.error:
            raise self.error
        return iter(())

    def get_state(self, cfg):
        return type("Snapshot", (), {"values": {}})()


@pytest.fixture
def client():
    return TestClient(main.app, raise_server_exceptions=False)


@pytest.fixture
def fake_graph(monkeypatch):
    graph = FakeGraph()
    monkeypatch.setattr(main, "agent_graph", lambda: graph)
    return graph


@pytest.fixture
def failing_graph(monkeypatch):
    error = RuntimeError("boom")
    error.diabeque_node = "risk"
    graph = FakeGraph(error)
    monkeypatch.setattr(main, "agent_graph", lambda: graph)
    return graph


def event_names(response) -> list[str]:
    return [line.removeprefix("event: ") for line in response.text.splitlines() if line.startswith("event: ")]


def test_agents_endpoint_reports_repo(client):
    body = client.get("/api/v1/agents").json()
    assert Path(body["repo_root"], "chap6-agents").is_dir()
    assert body["commit"] is None or len(body["commit"]) == 40
    assert isinstance(body["allow_simulation"], bool)


def test_agent_error_frame_precedes_stream_error(client, failing_graph):
    response = client.post("/api/v1/chat/stream", json={"message": "xin chào"})
    assert event_names(response)[-2:] == ["agent.error", "stream.error"]
    assert '"node": "risk"' in response.text and '"error_type": "RuntimeError"' in response.text


def test_untagged_exception_has_no_agent_error_frame(client, monkeypatch):
    monkeypatch.setattr(main, "agent_graph", lambda: FakeGraph(ValueError("x")))
    names = event_names(client.post("/api/v1/chat/stream", json={"message": "xin chào"}))
    assert names[-1] == "stream.error" and "agent.error" not in names


def test_simulate_ignored_without_setting(client, fake_graph, monkeypatch):
    monkeypatch.setattr(main.settings(), "allow_simulation", False)
    client.post("/api/v1/chat/stream", json={"message": "xin chào", "simulate": "llm_down"})
    assert fake_graph.inputs[-1]["llm_down"] is False


def test_simulate_honoured_with_setting(client, fake_graph, monkeypatch):
    monkeypatch.setattr(main.settings(), "allow_simulation", True)
    client.post("/api/v1/chat/stream", json={"message": "xin chào", "simulate": "llm_down"})
    assert fake_graph.inputs[-1]["llm_down"] is True
    client.post("/api/v1/chat/stream", json={"message": "xin chào"})
    assert fake_graph.inputs[-1]["llm_down"] is False
