# Assignment 08 — Neo4j và RAG tra cứu thông tin đái tháo đường

Trần Xuân Thành — B23DCAT280 — E23CNPM01 — nhóm 02
Intelligent System Development, học kỳ I.2026

Bản nộp: `../docs/graph_02_TranXuanThanh_280.pdf` (dựng từ `report/main.tex`). Kế hoạch thực hiện: `docs/plan.md`.

## Thành phần → nơi trả lời

| Thành phần | Mã | Báo cáo |
|---|---|---|
| Thu thập 35 tài liệu, làm sạch, chia đoạn | `pipeline/sources.yaml`, `fetch.py`, `clean_chunk.py` | §2.1–2.2 |
| Đồ thị `KB_diabet` trên Neo4j, vector bge-m3 | `backend/app/schema.py`, `db.py`, `pipeline/ingest_docs.py` | §3.1 |
| Trích dữ kiện y tế có kiểm câu trích | `pipeline/extract_facts.py`, `synonyms.yaml` | §3.2 |
| Khảo sát BRFSS → SQLite → đồ thị | `pipeline/survey_sqlite.py`, `survey_ingest.py` | §2.3–2.5, §3.3 |
| MLP ba nhóm và Type 1/2, 5 seed, hiệu chỉnh | `pipeline/train.py`, `backend/app/classify.py` | §5 |
| RAG: truy xuất, sinh, cổng trích dẫn, SSE | `backend/app/retrieval.py`, `answer.py`, `main.py` | §4 |
| Đánh giá truy xuất và câu trả lời | `eval/run_eval.py`, `eval/questions.jsonl` | §4.3, §6 |
| Giao diện web (dựng lại từ P-185) | `frontend/` | §3.4, §7 |

## Chạy lại

Venv, `.env` và Neo4j dùng chung ở gốc repo; xem [../DEPLOY.md](../DEPLOY.md). Từ thư mục này:

```bash
make api                      # FastAPI cổng 8100
make web                      # Next.js cổng 3100
make kb                       # nạp KB từ data/processed (không gọi LLM); hoặc `make kb-restore` ở gốc repo
make ingest                   # dựng KB từ đầu: tải nguồn, chia đoạn, nhúng, trích dữ kiện (~10 phút, ~520k token LLM)
make train                    # cần data/brfss: BRFSS 2015 + LLCP2023 từ CDC, 5 seed
make eval                     # gán tham chiếu, ablation truy xuất, chấm câu trả lời
make test                     # pytest; frontend: npm test
```

`data/raw`, `data/brfss`, `data/survey.db` không kèm repo; `data/processed` và `models/` có sẵn.

## Kết quả chính

| | |
|---|---|
| Truy xuất tốt nhất (vector bge-m3) | Hit@5 1,000 · MRR@10 0,792 trên 26 câu |
| Câu trả lời (vector + mở rộng đồ thị) | 25/26 câu được trả lời · 97,9% phát biểu có nguồn hỗ trợ · 4/4 câu ngoài phạm vi bị từ chối |
| MLP ba nhóm / Type 1/2 | macro-F1 0,4264 ± 0,0024 / 0,5436 ± 0,0063 (5 seed) |

## Khác với kế hoạch ban đầu

- 19 đặc trưng thay vì 21: tệp BRFSS 2023 không có câu hỏi ăn rau, trái cây.
- Xếp hạng chỉ bằng vector; đồ thị dùng để mở rộng ngữ cảnh. Gộp đồ thị vào RRF làm MRR giảm (bảng 13).
- CDC chặn tải tự động (403) nên không có trong kho tri thức.
- Thêm nhãn `Complication` vào lược đồ sau khi thấy biến chứng bị xếp vào triệu chứng.
- Cổng trích dẫn đợi câu trả lời đầy đủ rồi mới phát chữ, nên chữ không hiện dần.
