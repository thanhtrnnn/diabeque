#!/usr/bin/env python3
"""Gộp neo4j/cypher/*.cypher (theo thứ tự tên tệp) thành neo4j/kb_diabet.cypher.

    python scripts/combine_cypher.py            # ghi neo4j/kb_diabet.cypher
    python scripts/combine_cypher.py --check    # thoát 1 nếu tệp gộp lỗi thời (không xét dòng ngày)
"""

import argparse
import datetime
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "neo4j" / "cypher"
OUT = ROOT / "neo4j" / "kb_diabet.cypher"
DATE_PREFIX = "// Ngày tạo: "


def build(date: str) -> str:
    files = sorted(SRC.glob("*.cypher"))
    if not files:
        sys.exit(f"Không có tệp .cypher nào trong {SRC}")
    header = [
        "// kb_diabet.cypher: các truy vấn Cypher mà code Diabeque dùng, gộp thành một tệp để đọc và nộp kèm báo cáo.",
        "// Tệp sinh tự động, sửa ở neo4j/cypher/ rồi chạy `make cypher`. Không phải script dựng lại dữ liệu.",
        f"{DATE_PREFIX}{date}",
        "// Gồm các tệp: " + ", ".join(f.name for f in files),
        "",
    ]
    parts = ["\n".join(header)]
    for f in files:
        parts.append(f"// {'=' * 12} {f.name} {'=' * 12}\n\n{f.read_text(encoding='utf-8').strip()}\n")
    return "\n".join(parts)


def without_date(text: str) -> list[str]:
    return [line for line in text.splitlines() if not line.startswith(DATE_PREFIX)]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="chỉ kiểm tra, thoát 1 nếu tệp gộp lỗi thời")
    args = ap.parse_args()
    fresh = build(datetime.date.today().isoformat())
    if args.check:
        if not OUT.exists() or without_date(OUT.read_text(encoding="utf-8")) != without_date(fresh):
            print(f"{OUT.relative_to(ROOT)} đã lỗi thời: chạy `make cypher`", file=sys.stderr)
            return 1
        print(f"{OUT.relative_to(ROOT)} còn mới")
        return 0
    OUT.write_text(fresh, encoding="utf-8")
    print(f"Đã ghi {OUT.relative_to(ROOT)} ({len(fresh.splitlines())} dòng)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
