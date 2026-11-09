#!/usr/bin/env bash
# Bật / tắt demo Chương 5 (RAG) và Chương 6 (Diabeque) chạy local.
#   ./demo.sh up      Neo4j + RAG API 8100 + RAG web 3100 + Diabeque API 8200 + Diabeque web 3200
#   ./demo.sh check   kiểm tra 4 server và KB
#   ./demo.sh down    tắt 4 server (Neo4j giữ nguyên; tắt bằng: docker compose stop)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
LOG="$ROOT/.demo-logs"

check() {
  for p in 8100 3100 8200 3200; do
    code=$(curl -s -o /dev/null -w '%{http_code}' -m 5 "http://localhost:$p/" || true)
    echo "cổng $p: ${code:-không chạy}"
  done
  curl -s -m 5 http://localhost:8200/ready && echo
}

case "${1:-}" in
  up)
    mkdir -p "$LOG"
    (cd "$ROOT" && docker compose up -d --wait neo4j)
    (cd "$ROOT/chap5-rag" && nohup make api > "$LOG/rag-api.log" 2>&1 &)
    (cd "$ROOT/chap5-rag" && nohup make web > "$LOG/rag-web.log" 2>&1 &)
    (cd "$ROOT/chap6-agents" && nohup make api > "$LOG/agents-api.log" 2>&1 &)
    (cd "$ROOT/chap6-agents" && nohup make web > "$LOG/agents-web.log" 2>&1 &)
    echo "Đợi server khởi động..."
    for _ in $(seq 1 60); do
      curl -s -m 2 -o /dev/null http://localhost:8200/ready && curl -s -m 2 -o /dev/null http://localhost:3200/ && break
      sleep 2
    done
    check
    echo "Chương 5: http://localhost:3100   Chương 6: http://localhost:3200   Neo4j Browser: http://localhost:27474"
    ;;
  check) check ;;
  down)
    pkill -f "uvicorn backend.app.main:app --port 8100" || true
    pkill -f "uvicorn backend.app.main:app --port 8200" || true
    for p in 3100 3200; do lsof -tiTCP:$p -sTCP:LISTEN | xargs kill 2>/dev/null || true; done
    echo "Đã tắt 4 server."
    ;;
  *) echo "Dùng: $0 up|check|down"; exit 1 ;;
esac
