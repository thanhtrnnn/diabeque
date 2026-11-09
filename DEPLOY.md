# Hướng dẫn triển khai

Có hai cách. Cách A (chạy local) đã kiểm trên macOS (Apple Silicon) ngày 09/11/2026. Cách B (toàn bộ trong Docker)
mới kiểm cú pháp (`docker compose config`), chưa build image trên máy này.

## Yêu cầu

| Thành phần | Phiên bản | Ghi chú |
|---|---|---|
| Docker + Docker Compose v2 | | chạy Neo4j 5 |
| Python | 3.11 | cài qua [uv](https://docs.astral.sh/uv/) |
| Node.js | 22 | hai frontend Next.js |
| LLM | endpoint OpenAI-compatible | nhóm dùng `gemma-4`; cần mạng tới endpoint |
| Dung lượng | khoảng 5 GB | venv (torch) khoảng 1,2 GB, mô hình bge-m3 khoảng 2,2 GB, `node_modules` khoảng 1,2 GB |

Mô hình nhúng `BAAI/bge-m3` tự tải từ HuggingFace ở lần gọi đầu tiên (vào `~/.cache/huggingface`).

## Biến môi trường (`.env` ở gốc repo)

```bash
cp .env.example .env
```

| Biến | Ví dụ | Ý nghĩa |
|---|---|---|
| `OPENAI_BASE_URL` | `http://<host>:8000/llm/v1` | endpoint LLM; có thể kèm đuôi `/chat/completions` |
| `OPENAI_API_KEY` | | khóa của endpoint |
| `MODEL_NAME` | `gemma-4` | |
| `NEO4J_URI` | `bolt://localhost:27687` | Docker tự đổi thành `bolt://neo4j:7687` |
| `NEO4J_USER` / `NEO4J_PASSWORD` | `neo4j` / `kb_diabet_a8` | phải trùng lúc tạo volume Neo4j |
| `EMBEDDING_MODEL` | `BAAI/bge-m3` | |

Cả hai API đọc `.env` ở gốc repo; nếu có `chap5-rag/.env` hoặc `chap6-agents/.env` thì file đó ghi đè.
Không commit `.env` (đã nằm trong `.gitignore`).

## Cách A: chạy local (dùng khi demo)

```bash
make setup         # uv venv .venv (Python 3.11) + requirements; npm ci cho hai frontend; tạo .env nếu chưa có
make kb-restore    # bật Neo4j (docker compose), nạp neo4j/neo4j.dump vào volume diabeque_neo4j_data
make up            # = ./demo.sh up: API 8100, web 3100, API 8200, web 3200 (log ở .demo-logs/)
make check         # trạng thái 4 cổng + {"chunks":424, "agents":[...]}
make down          # tắt 4 server; Neo4j vẫn chạy (tắt hẳn: docker compose stop)
```

| Địa chỉ | Là gì |
|---|---|
| http://localhost:3100 | Chương 5: chat RAG, trang Đồ thị, trang Phân loại |
| http://localhost:3200 | Chương 6: chat Diabeque có bảng vết chạy agent |
| http://localhost:3200/app/kien-truc | sơ đồ 7 nút LangGraph |
| http://localhost:27474 | Neo4j Browser (`neo4j` / `kb_diabet_a8`) |
| http://localhost:8200/docs | Swagger của API Chương 6 |

Chạy riêng từng phần: `make -C chap5-rag api`, `make -C chap6-agents web`, ...

## Cách B: toàn bộ trong Docker

```bash
cp .env.example .env              # điền khóa LLM
make kb-restore                   # nạp KB một lần
make docker-up                    # = docker compose --profile full up -d --build
make docker-down
```

Năm container: `neo4j`, `rag-api` (8100), `rag-web` (3100), `agents-api` (8200), `agents-web` (3200).
Hai API dùng chung `docker/api.Dockerfile` (Python 3.11 slim, torch CPU), chọn thư mục bằng build arg `APP`.
Mô hình bge-m3 được tải vào volume `hf_cache` ở lần gọi đầu, nên câu hỏi đầu tiên chậm vài phút.
Frontend gọi API qua mạng nội bộ Docker (`API_BASE_URL=http://agents-api:8200/api/v1`), trình duyệt chỉ cần thấy cổng 3100/3200.

Đưa lên máy chủ: chép repo, tạo `.env`, chạy hai lệnh trên; chỉ mở cổng 3100 và 3200 ra ngoài,
giữ 27474/27687/8100/8200 trong mạng nội bộ (Neo4j dùng mật khẩu mặc định).

## Dựng lại dữ liệu (không bắt buộc)

| Muốn | Lệnh | Cần |
|---|---|---|
| KB từ văn bản đã xử lý, không dùng dump | `make kb` | `chap5-rag/data/processed/` (có sẵn); nhúng lại bằng bge-m3, dữ kiện lấy từ cache, không gọi LLM; thiếu nút khảo sát |
| KB từ đầu (tải 28 link + 7 PDF) | `make -C chap5-rag ingest` | mạng, khoảng 10 phút, khoảng 520k token LLM |
| `survey.db` và nút khảo sát | `make -C chap5-rag survey` | `chap5-rag/data/brfss/` (Kaggle BRFSS 2015 + CDC LLCP2023), không kèm repo |
| Huấn luyện lại MLP / CNN-1D / LSTM | `ln -s ../chap5-rag/data/survey.db chap6-agents/data/` rồi `make -C chap6-agents train` | `survey.db` |
| Đánh giá agent | `make -C chap6-agents eval` | LLM |

API Chương 6 hiệu chỉnh xác suất theo tần suất lớp của BRFSS. Khi không có `survey.db`, nó đọc
`chap6-agents/models/<task>/class_counts.json` (đã xuất sẵn, cho cùng kết quả).

## Sự cố thường gặp

| Triệu chứng | Nguyên nhân / cách xử lý |
|---|---|
| `make check` trả `{"chunks":0}` | Neo4j trống: `make kb-restore` |
| Cổng 27474/27687 đã bị chiếm | Neo4j khác đang chạy (ví dụ container của A8 gốc): `docker stop <tên>` rồi chạy lại |
| `docker pull` treo, tiến trình `docker-credential-desktop get` đứng yên | lỗi keychain của Docker Desktop trên macOS; mở Docker Desktop đăng nhập lại hoặc pull thủ công rồi chạy lại |
| Tra cứu / tư vấn báo lỗi, chào hỏi và khẩn cấp vẫn chạy | không gọi được LLM: kiểm `OPENAI_BASE_URL`, mạng |
| Câu đầu tiên rất chậm | đang tải hoặc nạp bge-m3; gửi thử mỗi câu demo một lần trước |
| API báo thiếu `openai_base_url` | chưa có `.env` ở gốc repo |
