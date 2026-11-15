"""Where a function lives in the repo, so a trace can point the reader at the code that ran."""

import inspect
from collections.abc import Callable
from pathlib import Path

from ..config import ROOT
from .state import CodeRef

REPO_ROOT = ROOT.parent


def code_ref(fn: Callable) -> CodeRef:
    """Path (relative to the repo root, POSIX separators) and `def` line of `fn`, looking through decorators."""
    fn = inspect.unwrap(fn)
    lines, first = inspect.getsourcelines(fn)  # starts at the first decorator, if any
    offset = next(i for i, text in enumerate(lines) if text.lstrip().startswith(("def ", "async def ")))
    path = Path(inspect.getsourcefile(fn)).resolve().relative_to(REPO_ROOT)
    return {"path": path.as_posix(), "line": first + offset}
