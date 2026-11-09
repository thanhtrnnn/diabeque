"""Chat model for agent decisions (intent, extraction). Same OpenAI-compatible endpoint as the A8 RAG generator."""

from functools import lru_cache

from langchain_openai import ChatOpenAI
from pydantic import ValidationError

from ..config import settings


@lru_cache
def chat() -> ChatOpenAI:
    s = settings()
    return ChatOpenAI(model=s.model_name, base_url=s.llm_base_url, api_key=s.openai_api_key, temperature=0, timeout=60,
                      max_retries=1)


class _Structured:
    """Ask for exactly one call of the `schema` tool and validate its arguments with pydantic.

    With a forced tool_choice (what `with_structured_output` sends) the endpoint returned 2 of 8 arguments on the
    intake example; with tool_choice "auto" it returned all 8. So the tool is offered, not forced."""

    def __init__(self, schema):
        self.schema = schema
        self.model = chat().bind_tools([schema])  # forcing tool_choice made the endpoint drop arguments

    def invoke(self, prompt):
        reply = self.model.invoke(prompt)
        calls = [c for c in reply.tool_calls if c["name"] == self.schema.__name__]
        if not calls:
            raise ValueError("model did not call the tool")
        args = dict(calls[0]["args"])
        try:
            return self.schema.model_validate(args)
        except ValidationError as e:  # keep the valid fields, drop the ones the model filled wrongly
            for err in e.errors():
                args.pop(err["loc"][0], None)
            return self.schema.model_validate(args)


def structured(schema) -> _Structured:
    """Model bound to return `schema` through a tool call (the endpoint supports tool calling, not JSON mode)."""
    return _Structured(schema)
