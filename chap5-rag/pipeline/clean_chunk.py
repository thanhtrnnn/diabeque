import argparse
import json
import logging
import re
import unicodedata
from collections import Counter
from functools import lru_cache
from pathlib import Path
from typing import NamedTuple

import trafilatura
from pypdf import PdfReader
from transformers import AutoTokenizer

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
BOILERPLATE = Path(__file__).with_name("boilerplate.txt")
TARGET, MAX_TOKENS, OVERLAP, MIN_OVERLAP, MIN_TOKENS = 350, 400, 50, 15, 30
MIN_DEDUP_CHARS = 25
SENTENCE_END = re.compile(r"(?<=[.!?])\s+")
BULLET = re.compile(r"^([\-+•*\uf0b7\uf0a7\uf0d8\uf02d]|\d+(\.\d+)*[.)]\s|[a-zđ][.)]\s)")
TERMINAL = (".", "!", "?", ":", ";", "…")
JUNK_CHARS = re.compile(r"[\u200b\u200c\u200d\ufeff\u00ad]")
SYMBOL_FONT = str.maketrans({"\uf061": "α", "\uf062": "β", "\uf067": "γ", "\uf064": "δ", "\uf06d": "μ", "\uf0b3": "≥", "\uf0a3": "≤", "\uf0b1": "±", "\uf0b4": "×", "\uf0ad": "↑", "\uf0af": "↓", "\uf0ae": "→", "\uf0e0": "→"})
MATH_ALNUM = re.compile("[\U0001d400-\U0001d7ff]")
WORD = re.compile(r"\w+")
BYLINE_TITLE = re.compile(r"^((pgs|gs|ts|ths|bs|bsnt|bscki*|ds|bác sĩ|dược sĩ|thạc sĩ|tiến sĩ|chuyên khoa|ck ?i+)[.\s]*\d*[.\s]*)+", re.I)
PAGE_NUMBER = re.compile(r"^(trang|page)?\s*\d{1,4}(\s*(/|of)\s*\d{1,4})?$", re.I)


@lru_cache(maxsize=1)
def tokenizer():
    return AutoTokenizer.from_pretrained("BAAI/bge-m3")


def count_tokens(text: str) -> int:
    return len(tokenizer()(text)["input_ids"])


class Patterns(NamedTuple):
    drop: list[re.Pattern]
    cut: list[re.Pattern]


def load_patterns(path: Path = BOILERPLATE) -> Patterns:
    lines = [ln.strip() for ln in path.read_text(encoding="utf-8").splitlines()]
    rules = [ln for ln in lines if ln and not ln.startswith("#")]
    cut = [re.compile(r[4:].strip(), re.I) for r in rules if r.startswith("cut:")]
    return Patterns([re.compile(r, re.I) for r in rules if not r.startswith("cut:")], cut)


def normalize(line: str) -> str:
    line = MATH_ALNUM.sub(lambda m: unicodedata.normalize("NFKC", m.group()), JUNK_CHARS.sub("", line))
    line = unicodedata.normalize("NFC", line.translate(SYMBOL_FONT)).replace("\xa0", " ")
    return re.sub(r"\s+", " ", line).strip()


def is_byline(line: str) -> bool:
    match = BYLINE_TITLE.match(line)
    words = line[match.end():].replace(",", " ").split() if match else []
    return bool(match) and len(line) <= 90 and 2 <= len(words) <= 5 and all(w.lstrip("0123456789")[:1].isupper() for w in words)


def drop_index_bullets(lines: list[str]) -> tuple[list[str], int]:
    headings = {ln.casefold() for ln in lines if not ln.startswith("- ")}
    kept = [ln for ln in lines if not (ln.startswith("- ") and ln[2:].casefold() in headings)]
    return kept, len(lines) - len(kept)


def strip_leading_labels(lines: list[str]) -> tuple[list[str], int]:
    start = 0
    while start < len(lines) and len(lines[start].split()) <= 3 and not lines[start].endswith(TERMINAL + ("-",)):
        start += 1
    return lines[start:], start


def drop_boilerplate(lines: list[str], patterns: Patterns) -> tuple[list[str], int, int]:
    kept, boiler, junk = [], 0, 0
    lines = [normalize(ln) for ln in lines]
    for i, line in enumerate(lines):
        if any(p.search(line) for p in patterns.cut):
            boiler += len([ln for ln in lines[i:] if ln])
            break
        if not any(c.isalpha() for c in line) or PAGE_NUMBER.match(line):
            junk += bool(line)
        elif is_byline(line) or any(p.search(line) for p in patterns.drop):
            boiler += 1
        else:
            kept.append(line)
    kept, indexed = drop_index_bullets(kept)
    kept, labels = strip_leading_labels(kept)
    return kept, boiler + indexed + labels, junk


def word_counts(paragraphs: list[list[str]]) -> Counter:
    return Counter(w.lower() for lines in paragraphs for line in lines for w in WORD.findall(normalize(line)))


def join_split_words(text: str, known: set[str], targets: set[str]) -> str:
    words: list[str] = []
    for word in text.split(" "):
        if words:
            a, b = words[-1].lower(), word.lower()
            if a.isalpha() and b.isalpha() and (a not in known or b not in known) and a + b in targets:
                words[-1] += word
                continue
        words.append(word)
    return " ".join(words)


def html_to_lines(html: str) -> tuple[str, list[str]]:
    text = trafilatura.extract(html, output_format="txt", include_comments=False, include_tables=True, favor_recall=True) or ""
    meta = trafilatura.extract_metadata(html)
    return (meta.title if meta and meta.title else ""), text.splitlines()


def pdf_paragraphs(pages: list[list[str]]) -> list[str]:
    seen = Counter(normalize(re.sub(r"\d+", "#", ln)) for page in pages for ln in set(page))
    repeated = {k for k, n in seen.items() if n >= max(3, 0.3 * len(pages))}
    paragraphs: list[str] = []
    for page in pages:
        for raw in page:
            line = normalize(raw)
            if not line or normalize(re.sub(r"\d+", "#", line)) in repeated:
                continue
            line = re.sub(r"^[\uf0b7\uf0a7\uf0d8\uf02d]\s*", "- ", line)
            starts_new = not paragraphs or BULLET.match(line) or (paragraphs[-1].endswith(TERMINAL) and line[0].isupper())
            if starts_new:
                paragraphs.append(line)
            elif paragraphs[-1].endswith("-") and line[0].islower():
                paragraphs[-1] = paragraphs[-1][:-1] + line
            else:
                paragraphs[-1] += " " + line
    return paragraphs


def pdf_to_lines(path: Path, mode: str = "plain") -> tuple[str, list[str]]:
    logging.getLogger("pypdf").setLevel(logging.CRITICAL)
    reader = PdfReader(path)
    pages = [(page.extract_text(extraction_mode=mode) or "").splitlines() for page in reader.pages]
    title = ((reader.metadata.title if reader.metadata else None) or "").strip()
    return title, pdf_paragraphs(pages)


def clean_title(title: str, publisher: str) -> str:
    parts = [p.strip() for p in re.split(r"\s+[|\-–—]\s+", normalize(title)) if p.strip()]
    pub = publisher.lower()
    own = [p for p in parts if p.lower() not in pub and pub not in p.lower()]
    return " - ".join(own or parts)


def split_sentences(text: str) -> list[str]:
    sentences: list[str] = []
    for part in SENTENCE_END.split(text):
        if sentences and (part[:1].islower() or part[:1] in "(["):
            sentences[-1] += " " + part
        else:
            sentences.append(part)
    return sentences


def is_heading(unit: str) -> bool:
    return len(unit.split()) <= 12 and not unit.endswith((".", "!"))


def split_long(paragraph: str) -> list[str]:
    if count_tokens(paragraph) <= TARGET:
        return [paragraph]
    pieces, current = [], ""
    for sentence in split_sentences(paragraph):
        words = sentence.split()
        while count_tokens(sentence) > TARGET:
            head = ""
            while words and count_tokens(f"{head} {words[0]}".strip()) <= TARGET:
                head = f"{head} {words.pop(0)}".strip()
            pieces.append(head)
            sentence = " ".join(words)
        candidate = f"{current} {sentence}".strip()
        if current and count_tokens(candidate) > TARGET:
            pieces.append(current)
            current = sentence
        else:
            current = candidate
    return pieces + [current] if current else pieces


def overlap_tail(units: list[str]) -> list[str]:
    tail: list[str] = []
    for unit in reversed(units):
        sentences = split_sentences(unit)
        taken = []
        for sentence in reversed(sentences):
            if count_tokens(" ".join([sentence, *taken, *tail])) > OVERLAP:
                break
            taken.insert(0, sentence)
        if len(taken) < len(sentences):
            tail = ([" ".join(taken)] if taken else []) + tail
            break
        tail.insert(0, unit)
    return tail if count_tokens("\n".join(tail)) >= MIN_OVERLAP else []


def chunk(paragraphs: list[str]) -> list[str]:
    units = [u for p in paragraphs for u in split_long(p)]
    chunks: list[str] = []
    current: list[str] = []
    for unit in units:
        if current and (count_tokens("\n".join(current)) >= TARGET or count_tokens("\n".join([*current, unit])) > MAX_TOKENS):
            carry: list[str] = []
            while len(current) > 1 and is_heading(current[-1]):
                carry.insert(0, current.pop())
            chunks.append("\n".join(current))
            current = overlap_tail(current) + carry
            if count_tokens("\n".join([*current, unit])) > MAX_TOKENS:
                current = carry
        current.append(unit)
    if current:
        chunks.append("\n".join(current))
    return chunks


def load_documents(manifest: list[dict], patterns: Patterns, stats: Counter) -> list[dict]:
    docs = []
    for entry in manifest:
        path = RAW / f"{entry['id']}.{entry['kind']}"
        if entry["kind"] == "html":
            title, lines = html_to_lines(path.read_bytes().decode("utf-8", "replace"))
        else:
            title, lines = pdf_to_lines(path, "layout" if entry["lang"] == "vi" else "plain")
        title = entry.get("title") or clean_title(title, entry["publisher"]) or entry["id"]
        docs.append({**entry, "title": title, "paragraphs": lines})
    for lang in {d["lang"] for d in docs}:
        html = [d["paragraphs"] for d in docs if d["lang"] == lang and d["kind"] == "html"]
        pdf = [d["paragraphs"] for d in docs if d["lang"] == lang and d["kind"] == "pdf"]
        known = set(word_counts(html))
        targets = known | {w for w, n in word_counts(pdf).items() if n >= 5 and len(w) >= 3}
        for doc in docs:
            if doc["lang"] == lang and doc["kind"] == "pdf":
                doc["paragraphs"] = [join_split_words(normalize(p), known, targets) for p in doc["paragraphs"]]
    for doc in docs:
        doc["paragraphs"], boiler, junk = drop_boilerplate(doc["paragraphs"], patterns)
        stats["boilerplate_lines"] += boiler
        stats["junk_lines"] += junk
    return docs


def drop_duplicates(docs: list[dict], stats: Counter) -> None:
    seen: set[str] = set()
    for doc in docs:
        kept = []
        for p in doc["paragraphs"]:
            key = p.casefold()
            if len(p) >= MIN_DEDUP_CHARS and key in seen:
                stats["duplicate_paragraphs"] += 1
                continue
            seen.add(key)
            kept.append(p)
        doc["paragraphs"] = kept


def build(manifest: list[dict], patterns: Patterns) -> tuple[list[dict], list[dict], Counter]:
    stats: Counter = Counter()
    docs = load_documents(manifest, patterns, stats)
    drop_duplicates(docs, stats)
    documents, chunks = [], []
    for doc in docs:
        rows = []
        for text in chunk(doc["paragraphs"]):
            n = count_tokens(text)
            if n < MIN_TOKENS:
                stats["chunks_dropped"] += 1
                continue
            rows.append({"id": f"{doc['id']}#{len(rows):03d}", "doc_id": doc["id"], "ord": len(rows), "text": text, "lang": doc["lang"], "n_tokens": n})
        if not rows:
            stats["docs_dropped"] += 1
            continue
        documents.append({k: doc[k] for k in ("id", "title", "publisher", "lang", "url", "kind", "sha256", "fetched_at")})
        chunks.extend(rows)
    return documents, chunks, stats


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")


def print_stats(documents: list[dict], chunks: list[dict], stats: Counter) -> None:
    langs = Counter(d["lang"] for d in documents)
    per_lang = Counter(c["lang"] for c in chunks)
    sizes = [c["n_tokens"] for c in chunks]
    print(f"documents: {len(documents)} (vi {langs['vi']}, en {langs['en']}), dropped empty: {stats['docs_dropped']}")
    print(f"chunks: {len(chunks)} (vi {per_lang['vi']}, en {per_lang['en']})")
    print(f"chunks dropped (<{MIN_TOKENS} tokens): {stats['chunks_dropped']}")
    print(f"boilerplate lines removed: {stats['boilerplate_lines']}")
    print(f"non-text lines removed: {stats['junk_lines']}")
    print(f"duplicate paragraphs removed: {stats['duplicate_paragraphs']}")
    print(f"tokens per chunk: mean {sum(sizes) / len(sizes):.0f}, min {min(sizes)}, max {max(sizes)}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stats", action="store_true", help="print corpus statistics")
    args = parser.parse_args()
    manifest = json.loads((RAW / "manifest.json").read_text(encoding="utf-8"))
    documents, chunks, stats = build(manifest, load_patterns())
    PROCESSED.mkdir(parents=True, exist_ok=True)
    write_jsonl(PROCESSED / "documents.jsonl", documents)
    write_jsonl(PROCESSED / "chunks.jsonl", chunks)
    if args.stats:
        print_stats(documents, chunks, stats)
    else:
        print(f"wrote {len(documents)} documents, {len(chunks)} chunks")


if __name__ == "__main__":
    main()
