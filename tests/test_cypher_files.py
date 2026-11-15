"""Các tệp neo4j/cypher/*.cypher phải khớp nguyên văn (sau khi chuẩn hóa khoảng trắng) với chuỗi Cypher trong code.

Khi một khối lệch, sửa khối trong tệp .cypher, không sửa Python.
"""

import ast
import importlib.util
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
CYPHER_DIR = ROOT / "neo4j" / "cypher"
EXPECTED_FILES = [
    "00_schema.cypher",
    "10_ingest.cypher",
    "20_facts.cypher",
    "30_survey.cypher",
    "40_retrieval.cypher",
    "50_demo.cypher",
]
CYPHER_WORD = re.compile(r"\b(MATCH|MERGE|CREATE|CALL|UNWIND)\b")


def _load_schema():
    path = ROOT / "chap5-rag" / "backend" / "app" / "schema.py"
    spec = importlib.util.spec_from_file_location("_schema_for_cypher_test", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


S = _load_schema()


# ---------- đọc các khối trong tệp .cypher ----------


@dataclass
class Block:
    file: str
    name: str
    sources: list[str]
    comment: str
    statement: str

    @property
    def id(self) -> str:
        return f"{self.file}:{self.name}"


def parse_blocks(path: Path) -> list[Block]:
    blocks: list[Block] = []
    current: dict | None = None
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"//\s*name:\s*(\S+)\s*$", line)
        if m:
            if current:
                blocks.append(_finish(path, current))
            current = {"name": m.group(1), "sources": [], "comment": [], "body": []}
            continue
        if current is None:
            continue  # phần đầu tệp (banner) trước khối đầu tiên
        if not current["body"] and line.strip().startswith("//"):
            m = re.match(r"//\s*source:\s*(\S+)\s*$", line)
            if m:
                current["sources"].append(m.group(1))
            else:
                current["comment"].append(line.strip()[2:].strip())
        elif current["body"] or line.strip():
            current["body"].append(line)
    if current:
        blocks.append(_finish(path, current))
    return blocks


def _finish(path: Path, c: dict) -> Block:
    return Block(path.name, c["name"], c["sources"], " ".join(c["comment"]), "\n".join(c["body"]).strip())


def all_blocks() -> list[Block]:
    return [b for name in EXPECTED_FILES if (CYPHER_DIR / name).exists() for b in parse_blocks(CYPHER_DIR / name)]


def norm(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    return text.removesuffix(";").strip()


# ---------- lấy chuỗi Cypher trong Python ----------

STATIC = {"KB_ID": S.KB_ID, "VECTOR_INDEX": S.VECTOR_INDEX, "EMBEDDING_DIM": str(S.EMBEDDING_DIM)}
for _label in S.Label:
    name = f"Label.{_label.name}"
    STATIC[name] = STATIC[f"{name}.value"] = _label.value
for _rel in S.Rel:
    name = f"Rel.{_rel.name}"
    STATIC[name] = STATIC[f"{name}.value"] = _rel.value


def _schema_envs() -> list[dict[str, str]]:
    """Vòng `for label in Label` trong ensure_schema()."""
    return [
        {
            "label": label.value,
            "label.lower()": label.lower(),
            "key": "code" if label is S.Label.SURVEY_STATUS else "id",
        }
        for label in S.Label
    ]


def _fact_envs() -> list[dict[str, str]]:
    """Vòng `for kind, (label, rel) in FACT_KINDS.items()` trong extract_facts.load()."""
    envs = []
    for label, rel in S.FACT_KINDS.values():
        name_prop = "text_vi" if label is S.Label.RECOMMENDATION else "name_vi"
        envs.append(
            {
                "label": label.value,
                "rel": rel.value,
                "name_prop": name_prop,
                "'text_vi' if name_prop == 'text_vi' else 'key_vi'": "text_vi" if name_prop == "text_vi" else "key_vi",
            }
        )
    return envs


LOOP_ENVS = _schema_envs() + _fact_envs()


class UnsupportedPlaceholder(Exception):
    pass


def _find_node(tree: ast.Module, name: str) -> ast.AST:
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name:
            return node
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == name for t in node.targets):
            return node
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.target.id == name:
            return node
    raise AssertionError(f"không thấy hàm/hằng `{name}`")


def _strings(node: ast.AST):
    """Các chuỗi và f-string trong node; không đi vào bên trong f-string."""
    for child in ast.iter_child_nodes(node):
        if isinstance(child, ast.JoinedStr) or (isinstance(child, ast.Constant) and isinstance(child.value, str)):
            yield child
        else:
            yield from _strings(child)


def _render(node: ast.AST, env: dict[str, str]) -> str:
    if isinstance(node, ast.Constant):
        return node.value
    out = []
    for part in node.values:
        if isinstance(part, ast.Constant):
            out.append(part.value)
            continue
        expr = ast.unparse(part.value)
        if expr in env:
            out.append(env[expr])
        elif expr in STATIC:
            out.append(STATIC[expr])
        else:
            raise UnsupportedPlaceholder("{" + expr + "}")
    return "".join(out)


def _literal_text(node: ast.AST) -> str:
    if isinstance(node, ast.Constant):
        return node.value
    return "".join(p.value for p in node.values if isinstance(p, ast.Constant))


def python_candidates(source: str) -> tuple[set[str], list[set[str]], set[str]]:
    """(mọi ứng viên đã chuẩn hóa, ứng viên theo từng chuỗi kiểu Cypher, placeholder chưa hỗ trợ)."""
    rel_path, name = source.split("::")
    tree = ast.parse((ROOT / rel_path).read_text(encoding="utf-8"))
    all_candidates: set[str] = set()
    per_string: list[set[str]] = []
    unsupported: set[str] = set()
    for node in _strings(_find_node(tree, name)):
        cands: set[str] = set()
        for env in [{}, *LOOP_ENVS]:
            try:
                cands.add(norm(_render(node, env)))
            except UnsupportedPlaceholder as exc:
                last = str(exc)
        if not cands:
            if CYPHER_WORD.search(_literal_text(node)):
                unsupported.add(last)
            continue
        all_candidates |= cands
        if CYPHER_WORD.search(_literal_text(node)):
            per_string.append(cands)
    return all_candidates, per_string, unsupported


def matches_source(block: Block, statement: str | None = None) -> list[str]:
    """Trả danh sách lỗi (rỗng nghĩa là khớp)."""
    statement = norm(block.statement if statement is None else statement)
    errors = []
    for source in block.sources:
        if source.endswith(".py") or ".py::" in source:
            candidates, _, unsupported = python_candidates(source)
            if unsupported:
                errors.append(f"{source}: placeholder chưa có trong bảng thay thế: {sorted(unsupported)}")
            if statement not in candidates:
                errors.append(f"{source}: khối không khớp chuỗi nào trong code")
        else:
            text = norm((ROOT / source).read_text(encoding="utf-8"))
            if statement not in text:
                errors.append(f"{source}: không thấy truy vấn trong tệp")
    return errors


# ---------- test ----------


def test_expected_files_exist():
    missing = [n for n in EXPECTED_FILES if not (CYPHER_DIR / n).exists()]
    assert not missing, f"thiếu tệp: {missing}"
    assert (CYPHER_DIR / "README.md").exists()


def test_blocks_well_formed():
    blocks = all_blocks()
    assert blocks, "chưa có khối nào"
    names = [b.name for b in blocks]
    assert len(names) == len(set(names)), f"trùng tên khối: {sorted({n for n in names if names.count(n) > 1})}"
    for b in blocks:
        assert re.fullmatch(r"[a-z][a-z0-9_]*", b.name), f"{b.id}: tên không phải snake_case"
        assert b.sources, f"{b.id}: thiếu // source:"
        assert b.comment, f"{b.id}: thiếu dòng chú thích tiếng Việt"
        assert b.statement.endswith(";"), f"{b.id}: câu lệnh phải kết thúc bằng ;"
        for s in b.sources:
            assert s == "DEMO.md" or re.fullmatch(r"[\w./-]+\.py::\w+", s), f"{b.id}: nguồn lạ {s}"
            assert (ROOT / s.split("::")[0]).exists(), f"{b.id}: không có tệp {s}"
    demo = [b for b in blocks if b.file == "50_demo.cypher"]
    assert demo and all(b.sources == ["DEMO.md"] for b in demo)


@pytest.mark.parametrize("block", all_blocks(), ids=lambda b: b.id)
def test_block_matches_source(block: Block):
    errors = matches_source(block)
    assert not errors, f"{block.id}: " + "; ".join(errors)


def test_every_python_query_is_listed():
    """Mỗi chuỗi Cypher trong hàm/hằng đã khai báo nguồn phải có mặt trong một khối cùng nguồn."""
    blocks = all_blocks()
    sources = {s for b in blocks for s in b.sources if "::" in s}
    for source in sorted(sources):
        listed = {norm(b.statement) for b in blocks if source in b.sources}
        _, per_string, _ = python_candidates(source)
        for cands in per_string:
            assert cands & listed, f"{source}: có truy vấn chưa nằm trong tệp .cypher: {sorted(cands)[0][:90]}..."


def test_matcher_detects_drift():
    """Chống test rỗng: sửa một ký tự trong khối thì phải bị phát hiện."""
    block = next(b for b in all_blocks() if any(s.endswith(".py") or ".py::" in s for s in b.sources))
    assert matches_source(block) == []
    altered = block.statement.removesuffix(";") + " LIMIT 1;"
    assert altered != block.statement
    assert matches_source(block, altered), "khối bị sửa mà vẫn khớp"


def test_combined_file_is_fresh():
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "combine_cypher.py"), "--check"], capture_output=True, text=True
    )
    assert result.returncode == 0, result.stdout + result.stderr
