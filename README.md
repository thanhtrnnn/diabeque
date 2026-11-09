# Diabeque: KB + RAG và hệ đa agent tư vấn đái tháo đường

![Diabeque](chap6-agents/assets/diabeque-mark.svg)

Trần Xuân Thành (B23DCAT280, E23CNPM01), nhóm 02. Intelligent System Development, học kỳ I.2026.
Sản phẩm của Chương 5 và Chương 6 trong tiểu luận Final, gộp vào một repo.

| Thư mục | Chương | Nội dung | Cổng |
|---|---|---|---|
| [chap5-rag/](chap5-rag/) | 5. KB + RAG (Assignment 08) | Kho tri thức Neo4j xây từ 28 link và 7 file PDF; RAG truy xuất lai, có cổng trích dẫn | API 8100 · web 3100 |
| [chap6-agents/](chap6-agents/) | 6. Hệ đa agent (project Diabeque) | 6 agent trên LangGraph; dùng lại RAG Chương 5 làm công cụ; CNN-1D/LSTM ước lượng nguy cơ | API 8200 · web 3200 |
| [neo4j/neo4j.dump](neo4j/) | dùng chung | Bản sao KB `KB_diabet` (6 MB): 35 tài liệu, 424 đoạn kèm vector bge-m3, dữ kiện y tế, 600 bản ghi khảo sát | Bolt 27687 · Browser 27474 |
| [docs/](docs/) | | PDF tiểu luận, báo cáo project Diabeque, báo cáo A8 | |

Hệ thống ước lượng nguy cơ và tư vấn có nguồn; **không chẩn đoán**. Nhãn huấn luyện là câu trả lời khảo sát tự báo cáo (BRFSS).

## Chạy nhanh

```bash
make setup        # venv Python 3.11 + npm ci hai frontend + tạo .env
# điền OPENAI_BASE_URL, OPENAI_API_KEY vào .env
make kb-restore   # Neo4j + nạp KB từ neo4j/neo4j.dump
make up           # 4 server; mở http://localhost:3100 (Chương 5) và http://localhost:3200 (Chương 6)
```

Chi tiết, Docker và xử lý sự cố: [DEPLOY.md](DEPLOY.md). Kịch bản demo và số liệu cần nhớ: [DEMO.md](DEMO.md).

## Kiến trúc

```
                        ┌─────────────────────── Neo4j KB_diabet ───────────────────────┐
                        │ Document ─ Chunk(vector bge-m3) ─ Disease/Symptom/Complication │
                        │ RiskFactor/Recommendation/DrugClass ─ SurveyRecord             │
                        └───────────────▲───────────────────────────▲───────────────────┘
                                        │                           │
  web 3100 ── BFF ── API 8100 (Chương 5)│           web 3200 ── BFF ── API 8200 (Chương 6, LangGraph)
                    truy xuất lai ──────┘             An toàn(vào) → Điều phối → Thu thập │ Tra cứu │ Dự đoán │ Tư vấn
                    sinh + cổng trích dẫn                                → An toàn(ra)
                    (LLM gemma-4, OpenAI-compatible)  Tra cứu / Tư vấn gọi lại RAG của Chương 5
```

## Kiểm thử

```bash
make test         # 37 test chap5-rag + 31 test chap6-agents; không cần LLM hay Neo4j
```
