"""LangGraph wiring: supervisor pattern with a safety check on the way in and on the way out."""

from functools import lru_cache

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph

from . import nodes
from .state import Agent, Intent, SessionState


def after_safety_in(state: SessionState) -> str:
    return Agent.SAFETY_OUT if state.get("emergency") else Agent.ORCHESTRATOR


def after_orchestrator(state: SessionState) -> str:
    return {Intent.KNOWLEDGE: Agent.KNOWLEDGE, Intent.ASSESS_RISK: Agent.INTAKE}.get(state["intent"], Agent.SAFETY_OUT)


def after_intake(state: SessionState) -> str:
    return Agent.SAFETY_OUT if state.get("missing") else Agent.RISK


def build(checkpointer=None):
    g = StateGraph(SessionState)
    g.add_node(Agent.SAFETY_IN, nodes.safety_in)
    g.add_node(Agent.ORCHESTRATOR, nodes.orchestrator)
    g.add_node(Agent.INTAKE, nodes.intake)
    g.add_node(Agent.RISK, nodes.risk)
    g.add_node(Agent.KNOWLEDGE, nodes.knowledge)
    g.add_node(Agent.ADVISOR, nodes.advisor)
    g.add_node(Agent.SAFETY_OUT, nodes.safety_out)

    g.add_edge(START, Agent.SAFETY_IN)
    g.add_conditional_edges(Agent.SAFETY_IN, after_safety_in, [Agent.ORCHESTRATOR, Agent.SAFETY_OUT])
    g.add_conditional_edges(Agent.ORCHESTRATOR, after_orchestrator, [Agent.KNOWLEDGE, Agent.INTAKE, Agent.SAFETY_OUT])
    g.add_conditional_edges(Agent.INTAKE, after_intake, [Agent.RISK, Agent.SAFETY_OUT])
    g.add_edge(Agent.RISK, Agent.ADVISOR)
    g.add_edge(Agent.ADVISOR, Agent.SAFETY_OUT)
    g.add_edge(Agent.KNOWLEDGE, Agent.SAFETY_OUT)
    g.add_edge(Agent.SAFETY_OUT, END)
    return g.compile(checkpointer=checkpointer)


@lru_cache
def app():
    """Graph with in-memory checkpoints: the profile survives across turns of one conversation_id."""
    return build(InMemorySaver())
