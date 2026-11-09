# Chương 5 — KB + RAG (Assignment 08). Venv và Neo4j dùng chung ở thư mục gốc repo.
PY := ../.venv/bin/python

.PHONY: schema fetch ingest kb survey train api web eval report test

schema:
	$(PY) -c "from backend.app.db import ensure_schema; ensure_schema()"

# Dựng lại KB từ đầu: tải 35 nguồn (link + PDF), chia đoạn, nhúng bge-m3, trích dữ kiện bằng LLM (~10 phút, ~520k token).
ingest: fetch kb

fetch:
	$(PY) -m pipeline.fetch
	$(PY) -m pipeline.clean_chunk --stats

# Nạp KB từ data/processed có sẵn trong repo: chỉ nhúng lại, dữ kiện lấy từ cache facts_raw.jsonl (không gọi LLM).
kb: schema
	$(PY) -m pipeline.ingest_docs
	$(PY) -m pipeline.extract_facts

# Cần data/brfss (Kaggle BRFSS 2015 + CDC LLCP2023), không kèm trong repo.
survey:
	$(PY) -m pipeline.survey_sqlite
	$(PY) -m pipeline.survey_ingest

train:
	$(PY) -m pipeline.survey_sqlite
	$(PY) -m pipeline.train

api:
	$(PY) -m uvicorn backend.app.main:app --port 8100

web:
	cd frontend && npm run dev -- --port 3100

eval:
	$(PY) -m eval.run_eval

report:
	$(PY) report/gen_tables.py && cd report && tectonic main.tex && cp main.pdf ../../docs/graph_02_TranXuanThanh_280.pdf

test:
	$(PY) -m pytest -q
