# Diabeque — Chương 5 (KB + RAG) và Chương 6 (hệ đa agent). Xem DEPLOY.md.
PY := .venv/bin/python
COMPOSE := docker compose

.PHONY: setup neo4j kb-restore kb up check down test docker-up docker-down

# Một venv Python 3.11 cho cả hai API + npm ci cho hai frontend.
setup:
	uv venv --python 3.11 .venv && uv pip install --python $(PY) -r chap6-agents/requirements.txt
	cd chap5-rag/frontend && npm ci
	cd chap6-agents/frontend && npm ci
	test -f .env || cp .env.example .env

neo4j:
	$(COMPOSE) up -d --wait neo4j

# Nạp KB từ neo4j/neo4j.dump (6 MB: 35 tài liệu, 424 đoạn kèm vector, dữ kiện, 600 bản ghi khảo sát). Ghi đè dữ liệu cũ.
kb-restore:
	$(COMPOSE) stop neo4j
	$(COMPOSE) run --rm neo4j-restore
	$(COMPOSE) up -d --wait neo4j

# Cách khác: dựng KB từ chap5-rag/data/processed (nhúng lại bằng bge-m3, không gọi LLM; thiếu nút khảo sát).
kb:
	$(MAKE) -C chap5-rag kb

up:
	./demo.sh up

check:
	./demo.sh check

down:
	./demo.sh down

test:
	$(MAKE) -C chap5-rag test
	$(MAKE) -C chap6-agents test

docker-up:
	$(COMPOSE) --profile full up -d --build

docker-down:
	$(COMPOSE) --profile full down
