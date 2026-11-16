# Demo + vấn đáp ngày 17/11: cầm tay chỉ việc

Bốn phần thầy sẽ hỏi, theo thứ tự: (1) Deep learning, Chap 1–4; (2) KB Neo4j + RAG; (3) hệ đa agent; (4) demo sản phẩm.
Mỗi phần có: **mở gì**, **nói gì** (3–5 câu), **số liệu cần thuộc**.

---

## 0. Chuẩn bị 30 phút trước

```bash
cd tieuluan_final/diabeque
make check          # Neo4j 27687/27474, API 8100/8200, web 3100/3200 phải đều OK
```

Nếu thiếu dịch vụ: `make up`. Nếu `{"chunks":0}`: `make kb-restore`.

**LLM mới (NVIDIA `google/gemma-4-31b-it`) chậm: 30–55 giây mỗi lần gọi.**
- Câu hỏi kiến thức (2 lần gọi LLM): khoảng 1–1,5 phút.
- Đánh giá nguy cơ (lượt cuối 3–4 lần gọi): khoảng 3–4 phút.
- Vì vậy: **chạy thử trước mọi câu demo**, và trong lúc chờ thì giải thích vết chạy bên phải (mỗi agent hiện ra khi xong).

Mở sẵn các tab:

| Tab | Dùng cho |
|---|---|
| `docs/tieuluanFinal_02_nhom02_TranXuanThanh.pdf` (bản tiếng Việt đã nộp) | Chap 1–4 |
| `../tieuluanFinal_02_nhom02_TranXuanThanh_EN.pdf` (bản tiếng Anh, 97 trang) | nếu thầy hỏi bản tiếng Anh |
| VS Code: `chap5-rag/pipeline/sources.yaml`, `neo4j/kb_diabet.cypher`, `chap6-agents/backend/app/agents/graph.py` | phần 2, 3 |
| `http://localhost:27474` (neo4j / `kb_diabet_a8`) | Neo4j Browser |
| `http://localhost:3100` | RAG Chương 5 |
| `http://localhost:3200/app/kien-truc` | sơ đồ đa agent |
| `http://localhost:3200/app/chat` và `/app/nha-may` | demo Chương 6 |
| `http://localhost:3200/app/on-tap` | 51 câu vấn đáp có đáp án (để tự ôn) |

---

## 1. Deep learning (Chap 1–4 tiểu luận)

### 1a. Mô hình dùng trong sản phẩm (câu hỏi chắc chắn gặp)

File: `chap6-agents/backend/app/nets.py`. Ba kiến trúc trên **19 đặc trưng BRFSS**:

| Model | Các lớp | Dùng ở đâu |
|---|---|---|
| MLP | Linear 19→64, ReLU, Dropout 0,15 → Linear 64→32, ReLU, Dropout → Linear 32→số lớp | baseline |
| **CNN-1D** | `FeatureTokens`: mỗi đặc trưng thành token 16 chiều (giá trị × vector học được + embedding vị trí) → Conv1d 16→32, k=3 → ReLU → Conv1d 32→32, k=3 → ReLU → gộp mean + max (64) → Dropout → Linear 64→32 → ReLU → Linear 32→3 | **mô hình 3 nhóm** (không mắc / tiền ĐTĐ / ĐTĐ) |
| **LSTM** | `FeatureTokens` → LSTM **hai chiều**, hidden 32 → ghép trạng thái cuối 2 chiều (64) → Dropout → Linear 64→32 → ReLU → Linear 32→2 | **phân Type 1 / Type 2** cho người đã chẩn đoán |

Nói: "Đặc trưng khảo sát không có thứ tự tự nhiên, nên em biến 19 đặc trưng thành chuỗi 19 token để thử xem tích chập hoặc hồi quy trên chuỗi token có giúp không. Em chọn theo macro-F1 trên tập xác thực, 3 seed."

| Số liệu | Giá trị |
|---|---|
| Dữ liệu dự án | BRFSS 2015 + 2023: **686.019 dòng, 19 đặc trưng** |
| 3 nhóm, macro-F1 xác thực | **CNN-1D 0,4305 ± 0,0039**, LSTM 0,4291, MLP 0,4259 |
| Type 1/2 (22.027 dòng) | **LSTM 0,5686 ± 0,0209** |
| Hiệu chỉnh xác suất | temperature scaling + bỏ trọng số lớp: ECE 0,088 → 0,006 |
| Cấu hình | batch 512, lr 0,001, tối đa 40 epoch, early stopping patience 7, seed 0/1/2 |

Nếu bị hỏi "sao F1 thấp?": nhãn BRFSS là **tự báo cáo**, lớp tiền ĐTĐ rất hiếm (gần như không học được); vì vậy hệ thống chỉ **ước lượng**, không chẩn đoán, và có thêm agent luật sàng lọc.

### 1b. Các chương: model + dataset + kết quả (≥ 3 dataset)

| Chương | Model / lớp | Dataset | Kết quả chính |
|---|---|---|---|
| **1. ML** (A1–A3) | hồi quy logistic, random forest, HistGradientBoosting, LinearSVC; A3: MLP NumPy 8→16→8→1 | **3 dataset A2**: BRFSS 2015 (253.680 dòng), USA Real Estate (2,2 triệu dòng), ticket hỗ trợ khách hàng (85.907 dòng); A3: Pima | BRFSS: random forest, recall 0,5832; nhà: HistGB, MAE 118.275 USD; ticket: logistic, macro-F1 0,7793 |
| **2. CNN** (A4, A5) | A4: một kiến trúc, 3 bản cài đặt (NumPy im2col, Keras, PyTorch); A5: CNN 3 lớp và 5 lớp, Keras và PyTorch | MNIST, CIFAR-10, BRFSS (A4); VinBigData X-quang ngực 15.000 ảnh, CIFAR-10, BRFSS (A5) | A4 độ chính xác: MNIST 0,984 cả 3 bản; CIFAR-10 0,676–0,678. A5 F1 test (3→5 lớp, PyTorch): X-quang 0,816→0,876, CIFAR-10 0,685→0,760 |
| **3. RNN** (A6, A7) | RNN NumPy / Keras SimpleRNN / PyTorch nn.RNN | giao dịch theo giờ (A6), giá cổ phiếu FPT, đánh giá điện thoại tiếng Việt (A7) | A6 RMSE: PyTorch 3,77, Keras 3,80, NumPy 4,51 so với baseline 5,89; cổ phiếu: RNN không thắng "ngày mai = hôm nay" |
| **4. LSTM** (A7) | LSTM 32 unit (cổ phiếu), LSTM văn bản; so với RNN, 5 seed, 2 thư viện | FPT, đánh giá tiếng Việt, BRFSS (dự án) | Cảm xúc macro-F1: **LSTM 0,635–0,651** so với RNN 0,592–0,594; cổ phiếu RMSE ~1.648 VND ≈ baseline 1.645 |

Câu chốt: "LSTM thắng rõ ở văn bản (phụ thuộc xa, cổng nhớ), còn ở giá cổ phiếu cả RNN và LSTM đều không thắng baseline: tín hiệu không nằm trong dữ liệu giá."

---

## 2. KB Neo4j + RAG (Chương 5)

### 2a. Nguồn KB: link + PDF (yêu cầu ≥ 5)

Mở `chap5-rag/pipeline/sources.yaml`. **35 nguồn: 28 link HTML + 7 file PDF**; 13 tiếng Việt, 22 tiếng Anh.
Chỉ vào 3 khối đầu: 3 PDF của **Bộ Y tế** (QĐ 5481 Type 2, QĐ 3087 tiền ĐTĐ, QĐ 1760 Type 1). Mỗi khối có `id, url, publisher, lang, kind (pdf/html), topic`.
Nhà xuất bản: Bộ Y tế, NIDDK, NHS, ADA, WHO, Vinmec, Tâm Anh, BV TWQĐ 108, MedlinePlus, Diabetes UK.

### 2b. Pipeline (code)

| Bước | File |
|---|---|
| Tải trang và PDF (`trafilatura`, `pypdf`) | `chap5-rag/pipeline/fetch.py` |
| Làm sạch, chia đoạn | `chap5-rag/pipeline/clean_chunk.py` |
| Nhúng `BAAI/bge-m3` (1024 chiều) + nạp Neo4j | `chap5-rag/pipeline/ingest_docs.py`, `backend/app/embedding.py` |
| LLM trích dữ kiện (triệu chứng, biến chứng, ...) có kiểm câu trích | `chap5-rag/pipeline/extract_facts.py` |
| Truy xuất lai: vector + BM25 + mở rộng đồ thị, RRF | `chap5-rag/backend/app/retrieval.py` (`vector_search`, `bm25_search`, `graph_search`, `rrf`, `retrieve`) |
| Sinh câu trả lời + cổng trích dẫn | `chap5-rag/backend/app/answer.py` (`build_messages`, `gate`) |

### 2c. KB lưu ở đâu

- **Neo4j 5** chạy trong Docker, container `diabeque-neo4j-1`, dữ liệu ở volume `neo4j_data`, database `neo4j`.
- Cổng: Bolt `27687`, Browser `27474`. Mọi nút gắn `kb = "KB_diabet"`; chỉ mục vector `chunk_embedding` trên nút `Chunk`.
- Bản sao để nộp và dựng lại: `neo4j/neo4j.dump` (6 MB), nạp bằng `make kb-restore`.
- Đồ thị: 35 Document, 424 Chunk, 5 Disease, 219 Symptom, 257 Complication, 276 RiskFactor, 840 Recommendation, 191 DrugClass, 600 SurveyRecord.

Demo trong Neo4j Browser (dán từ `neo4j/cypher/50_demo.cypher`):
```cypher
MATCH (d:Document)<-[:PART_OF]-(c:Chunk) RETURN d, c LIMIT 60;
MATCH p=(:Disease)-[:HAS_SYMPTOM]->(:Symptom)-[:SUPPORTED_BY]->(:Chunk) RETURN p LIMIT 25;
MATCH (d:Document) RETURN d.kind, count(*);   // pdf 7, html 28
```

### 2d. Nhiều file Cypher gộp thành 1

- 6 file theo giai đoạn ở `neo4j/cypher/`: `00_schema` (ràng buộc + chỉ mục vector), `10_ingest`, `20_facts`, `30_survey`, `40_retrieval`, `50_demo`.
- Gộp thành **`neo4j/kb_diabet.cypher`** (288 dòng) bằng `make cypher` → `scripts/combine_cypher.py`. Kiểm: `.venv/bin/python scripts/combine_cypher.py --check` → "còn mới".
- Mỗi khối có `// name:` và `// source: <file.py>::<hàm>`; có **test** kiểm câu Cypher trong file khớp nguyên văn chuỗi trong code Python.
- Nói rõ: đây là **tập truy vấn code dùng**, không phải script dựng lại dữ liệu; dữ liệu dựng từ dump.

### 2e. Số liệu RAG

Hit@5 **1,000**, MRR@10 **0,792** (26 câu); **97,9%** phát biểu có nguồn hỗ trợ; **4/4** câu ngoài phạm vi bị từ chối (cosine < 0,78).

---

## 3. Hệ đa agent (Chương 6)

Mở `/app/kien-truc` rồi `chap6-agents/backend/app/agents/graph.py`.

**LangGraph, 9 nút, state chung `SessionState`:**

```
An toàn (vào) → Điều phối ─┬─ kiến thức → Tra cứu tri thức (RAG Chương 5) ─────────────┐
                           ├─ nguy cơ → Thu thập → Dự đoán (CNN-1D/LSTM) → Luật sàng lọc → Tư vấn ─┤
                           └─ chào hỏi / ngoài phạm vi ───────────────────────────────┤
khẩn cấp: An toàn (vào) đi thẳng ───────────────────────────────────────────→ An toàn (ra) → Giám sát
```

Đối chiếu với tài liệu kiến trúc của thầy (`project_architecture_multiagent_diabet_v1.pdf`, 8 vai trò):

| Vai trò trong PDF | Nút trong code | Làm gì |
|---|---|---|
| Coordinator | `orchestrator` | LLM phân loại ý định; sinh `request_id`; `aggregate()` tách dự đoán / luật / bằng chứng |
| Patient Data | `intake` | LLM + regex trích hồ sơ, `validate_profile`, BMI bằng code; thiếu thì hỏi tối đa 3 câu |
| DL Prediction | `risk` | CNN-1D (3 nhóm) hoặc LSTM (Type 1/2), kèm `model_version` (hash trọng số) |
| Rule-Based | `rules` | luật ADA 2025: BMI ≥ 23, ≥ 35 tuổi, huyết áp, mỡ máu, vận động; ngưỡng HbA1c / đường huyết đói; cờ khi luật và mô hình lệch nhau |
| KG/RAG | `knowledge` (+ `get_recommendations` cho tư vấn) | RAG Chương 5 trên Neo4j |
| Explanation | `advisor` | LLM viết lời khuyên, mỗi ý một trích dẫn |
| Monitoring | `audit` | ghi `results/audit.jsonl`, thống kê `GET /api/v1/audit`; không lưu nội dung tin nhắn |
| RL (tùy chọn) | **chưa làm**, nói thẳng là hướng mở rộng | |
| (thêm) An toàn | `safety_in`, `safety_out` | chặn tình huống khẩn cấp; bỏ liều thuốc, kết luận chẩn đoán, câu không trích dẫn |

**Hợp đồng thông điệp** (PDF mục 6.1): mỗi bước trong vết chạy có `request_id, agent, status (ok/fallback), version, evidence`.

Ý chính để nói:
1. LLM chỉ làm 3 việc cần hiểu ngôn ngữ (ý định, trích hồ sơ, viết lời khuyên). Mọi thứ xác định được (BMI, mã hóa BRFSS, luật, an toàn) là code, nên kiểm thử được: **73 test backend + 229 test frontend**, không cần LLM.
2. Mỗi agent LLM có **dự phòng**: LLM lỗi thì dùng luật / đoạn tài liệu / dữ kiện đồ thị; vết chạy ghi "dự phòng".
3. Đã đo so với một agent duy nhất: hồ sơ đưa vào mô hình đúng **28/28 (đa agent) vs 21/28 (một agent)**; trích dẫn trung bình 10,0 vs 5,5; an toàn 11/11 cả hai.

---

## 4. Demo sản phẩm (khoảng 8 phút)

Trang `/app/chat` (hoặc `/app/nha-may` để thấy từng agent chạy và khung câu trả lời bên dưới).

| # | Gõ | Chỉ vào | Thời gian |
|---|---|---|---|
| 1 | "Xin chào, bạn làm được gì?" | ý định `greeting` | ~10–60 s |
| 2 | "HbA1c bao nhiêu thì được chẩn đoán đái tháo đường?" | Điều phối → Tra cứu → An toàn (ra) → Giám sát; "≥ 6,5%", có trích dẫn, bấm xem nguồn | ~1–1,5 phút |
| 3 | Hội thoại mới: "Tôi 52 tuổi, nam, cao 1m65, nặng 80kg, bị huyết áp cao, HbA1c 6,1%. Tôi có nguy cơ tiểu đường không?" | Thu thập ghi 4 trường, BMI 29,4 (code), hỏi 3 trường còn thiếu | ~2 phút |
| 4 | "Mỡ máu bình thường, tôi ít vận động, sức khỏe chung trung bình" | 8 bước. CNN-1D **62% / 3% / 35%**; mục **Đối chiếu luật sàng lọc**: R01, R02, R04, R05, R06, L01 (HbA1c 6,1% = ngưỡng tiền ĐTĐ); lời khuyên có trích dẫn | ~4 phút |
| 5 | Hội thoại mới: "Mẹ tôi tiêm insulin xong thì lú lẫn, vã mồ hôi, gọi không trả lời" | An toàn (vào) dừng ngay, 0 ms, không gọi LLM, khuyên gọi 115 | tức thì |
| 6 | (nếu còn giờ) "Tôi nên tiêm bao nhiêu đơn vị insulin mỗi ngày?" | An toàn (ra) bỏ câu có liều, cờ `dosage_removed` | ~1 phút |

Mẹo thời gian: gõ câu 3–4 **trước khi** trình bày phần 3, để vừa giảng kiến trúc vừa chờ kết quả.

Sau demo, mở `http://localhost:8200/api/v1/audit` để chỉ agent Giám sát: số lượt, tỉ lệ dự phòng, thời gian trung bình mỗi agent.

### Nếu sự cố

| Triệu chứng | Xử lý |
|---|---|
| Chờ quá lâu ở Thu thập / Tư vấn | LLM chậm; vết chạy sẽ hiện "dự phòng: luật thay LLM", kết quả vẫn ra. Chuyển sang câu 5 (không cần LLM) |
| API không trả lời | `make check`; xem `.demo-logs/chap6-api.log` |
| `{"chunks":0}` | `make kb-restore` |
| Câu chữ khác lần thử | LLM không tất định; cấu trúc, số liệu mô hình, luật, cờ an toàn thì giữ nguyên |

---

## 5. Câu hỏi khó có thể gặp

- **Sao dùng đa agent mà không một agent?** Đã đo: một agent mã hóa sai nhóm tuổi ở 3/4 hội thoại (21/28 vs 28/28). Tách agent thì phần xác định viết bằng code và test riêng.
- **Mô hình có chẩn đoán được không?** Không. Nhãn tự báo cáo, macro-F1 ~0,43. Vì thế có agent luật sàng lọc dùng ngưỡng xét nghiệm thật, và câu trả lời luôn khuyên đi xét nghiệm.
- **Sao chọn CNN-1D?** Macro-F1 xác thực cao nhất nhưng chỉ hơn MLP 1–2 độ lệch chuẩn, đổi lại huấn luyện lâu gấp ~55 lần. Nói thẳng điều này.
- **Luật và mô hình mâu thuẫn thì sao?** Agent luật gắn cờ V01/V02, lời khuyên ưu tiên đi xét nghiệm; coordinator giữ hai kết quả tách riêng, không trộn.
- **Dữ liệu người dùng lưu ở đâu?** Hồ sơ trong bộ nhớ phiên (`InMemorySaver`, mất khi khởi động lại); nhật ký giám sát chỉ lưu siêu dữ liệu, không lưu tin nhắn.
- **RL agent?** Chưa làm; theo PDF là phần tùy chọn, chỉ chạy trong môi trường mô phỏng (chọn khoảng theo dõi, chọn bài học), không đụng bệnh nhân thật.
- **Triển khai?** Local bằng Makefile hoặc Docker Compose (`DEPLOY.md`); bản đang chạy công khai qua tunnel `lab.drakefamtax.id.vn`.
