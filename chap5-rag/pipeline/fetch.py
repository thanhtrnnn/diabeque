import argparse
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import httpx
import yaml

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "pipeline" / "sources.yaml"
RAW = ROOT / "data" / "raw"
MANIFEST = RAW / "manifest.json"
FAILURES = RAW / "failures.json"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
    "Accept-Language": "vi,en;q=0.8",
}
MIN_HTML_BYTES = 3000


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def download(client: httpx.Client, src: dict) -> bytes:
    last: Exception | None = None
    for _ in range(2):
        try:
            resp = client.get(src["url"])
            resp.raise_for_status()
            body = resp.content
            if src["kind"] == "pdf" and not body.startswith(b"%PDF"):
                raise ValueError("response is not a PDF")
            if src["kind"] == "html" and len(body) < MIN_HTML_BYTES:
                raise ValueError(f"html too short ({len(body)} bytes)")
            return body
        except (httpx.HTTPError, ValueError) as exc:
            last = exc
    raise last


def fetch_one(client: httpx.Client, src: dict, old: dict, force: bool) -> tuple[dict | None, dict | None]:
    path = RAW / f"{src['id']}.{src['kind']}"
    prev = old.get(src["id"])
    if path.exists() and not force:
        body = path.read_bytes()
        stamp = prev["fetched_at"] if prev and prev["sha256"] == sha256(body) else datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat(timespec="seconds")
    else:
        try:
            body = download(client, src)
        except Exception as exc:
            return None, {"id": src["id"], "url": src["url"], "error": f"{type(exc).__name__}: {str(exc).splitlines()[0]}"}
        path.write_bytes(body)
        stamp = prev["fetched_at"] if prev and prev["sha256"] == sha256(body) else now()
    entry = {k: src[k] for k in ("id", "url", "publisher", "lang", "kind")}
    entry |= {"topic": src["topic"], "title": src.get("title"), "sha256": sha256(body), "fetched_at": stamp, "bytes": len(body)}
    return entry, None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="re-download files that already exist")
    args = parser.parse_args()
    sources = yaml.safe_load(SOURCES.read_text(encoding="utf-8"))
    RAW.mkdir(parents=True, exist_ok=True)
    old = {e["id"]: e for e in json.loads(MANIFEST.read_text())} if MANIFEST.exists() else {}
    with httpx.Client(headers=HEADERS, timeout=30, follow_redirects=True) as client, ThreadPoolExecutor(8) as pool:
        results = list(pool.map(lambda s: fetch_one(client, s, old, args.force), sources))
    manifest = [entry for entry, _ in results if entry]
    failures = [fail for _, fail in results if fail]
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    FAILURES.write_text(json.dumps(failures, ensure_ascii=False, indent=1), encoding="utf-8")
    for fail in failures:
        print(f"FAIL {fail['id']}: {fail['error']}")
    by = {}
    for e in manifest:
        by[(e["lang"], e["kind"])] = by.get((e["lang"], e["kind"]), 0) + 1
    print(f"ok {len(manifest)}/{len(sources)}", dict(sorted(by.items())))


if __name__ == "__main__":
    main()
