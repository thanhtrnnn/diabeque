# Chương 6 — hệ đa agent Diabeque. Venv và Neo4j dùng chung ở thư mục gốc repo; KB do chap5-rag nạp.
PY := ../.venv/bin/python

.PHONY: train api web eval test report

# Cần data/survey.db (dựng bằng `make -C ../chap5-rag train` rồi liên kết sang data/), không kèm trong repo.
train:
	$(PY) -m pipeline.train_dl

api:
	$(PY) -m uvicorn backend.app.main:app --port 8200

web:
	cd frontend && npm run dev -- --port 3200

eval:
	$(PY) -m eval.run_agents

test:
	$(PY) -m pytest -q tests

report:
	$(PY) report/gen_tables.py && cd report && tectonic main.tex && cp main.pdf ../../docs/Diabeque_02_TranXuanThanh_280.pdf
