# Kế hoạch A8. RAG và Neo4j tra cứu thông tin đái tháo đường

Ứng dụng web hỏi đáp về đái tháo đường. Câu trả lời luôn kèm đoạn nguồn trích dẫn được. Tri thức nằm trên đồ thị Neo4j `KB_diabet`. Một bộ phân loại MLP trên khảo sát BRFSS dự đoán nhóm tình trạng rồi chọn chủ đề tra cứu. Người dùng là sinh viên và giảng viên chấm bài, ngoài ra là người đọc báo cáo. Kiến trúc và giao diện lấy từ P-185, gọt phần thuế. Báo cáo LaTeX theo bố cục 9 mục của bài tham khảo.

Quy tắc xuyên suốt. Không phát biểu nào hiển thị cho người dùng mà thiếu đoạn nguồn nằm trong ngữ cảnh đã gửi cho mô hình. Thiếu bằng chứng thì từ chối có trạng thái rõ.

Thứ tự đơn vị. U0 nền móng, U1 thu thập, U2 nạp đồ thị, U3 dữ kiện y tế, U4 phân loại, U5 API hỏi đáp, U6 đánh giá, U7 giao diện, U8 báo cáo.

## Cách đọc

Một ô là một việc. Mỗi ô nêu bằng chứng kiểm nó. Ô lồng là bước con của ô trên. Chỉ tick khi bằng chứng tồn tại, ví dụ tệp, dòng log, ảnh chụp, lần chạy test.

Thư mục bài làm là `ass_08/A8_02_TranXuanThanh_280/`. Thư mục này không phải git repo, nên đơn vị thay cho PR. Mỗi đơn vị kết thúc bằng một trạng thái kiểm được trước khi sang đơn vị sau.

Test thôi chưa đủ. Một đơn vị chỉ xong khi ô unit, ô live và ô perf của nó đều được tick.

Lựa chọn đã chốt với người dùng ngày 25/10/2026.

- LLM qua endpoint OpenAI-compatible, dùng lại biến `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `MODEL_NAME` từ `P-185/.env`.
- Có phần phân loại MLP, đủ như bài tham khảo.
- Frontend copy Next.js của P-185 rồi gọt phần thuế.
- Có báo cáo `A8_02_TranXuanThanh_280.pdf` viết bằng LaTeX và tectonic.

## Hình dạng dữ liệu

Đặt trước mọi dòng code. Một tệp `backend/app/schema.py` giữ toàn bộ nhãn, quan hệ và chủ đề làm nguồn sự thật duy nhất. Pipeline nạp, truy xuất và frontend đều đọc từ đây.

Nút trên Neo4j, mọi nút mang `kb_id = "KB_diabet"`, ràng buộc duy nhất trên `id`.

| Nhãn | Thuộc tính chính |
|---|---|
| Document | id, title, publisher, lang, url, kind (html hoặc pdf), sha256, fetched_at |
| Chunk | id, doc_id, ord, text, lang, n_tokens, embedding (1024 số) |
| Disease | id, name_vi, name_en, topic |
| Symptom, RiskFactor, DrugClass | id, name_vi, name_en |
| Recommendation | id, text_vi, condition, topic |
| SurveyRecord | id, year, status, features_json |
| SurveyStatus | code, label_vi |

Quan hệ gồm `PART_OF` (Chunk tới Document), `HAS_SYMPTOM`, `HAS_RISK_FACTOR`, `HAS_RECOMMENDATION`, `HAS_DRUG_CLASS`, `SUPPORTED_BY {quote}` (mục dữ kiện tới Chunk), `HAS_REPORTED_STATUS`.

Bảng chủ đề thay cho chuỗi if/else. Nhãn phân loại tra bảng ra chủ đề, chủ đề tra ra Disease dùng để lọc truy xuất.

| Nhãn dự đoán | Chủ đề | Disease |
|---|---|---|
| 0 không báo cáo bệnh | prevention | dtd_chung |
| 1 tiền đái tháo đường | prediabetes | tien_dtd |
| 2 báo cáo mắc bệnh | diabetes_general | dtd_chung |
| Type 1 | type1 | dtd_type1 |
| Type 2 | type2 | dtd_type2 |

Trạng thái câu trả lời là một enum ba giá trị `answered`, `insufficient_evidence`, `out_of_scope`, giống P-185. Không dùng cờ boolean rời.

Hợp đồng SSE lấy tập con của P-185 v1 để giữ nguyên parser và reducer phía frontend. Các sự kiện gồm `stream.started`, `sources.snapshot`, `answer.started`, `answer.text.delta`, `answer.citation`, `answer.final`, `stream.completed`, `stream.error`, cùng envelope `{v, seq, request_id, conversation_id, answer_id, timestamp, data}`.

## Kiến trúc

```
nguồn web/PDF ──fetch──> data/raw ──clean+chunk──> chunks.jsonl ──bge-m3──> Neo4j (Document, Chunk, vector index)
                                                      └──LLM trích dữ kiện + kiểm quote──> Disease/Recommendation/... SUPPORTED_BY Chunk
BRFSS CSV/XPT ──> SQLite survey.db ──> MLP (PyTorch) ──> model.pt + scaler
                                   └──600 dòng mẫu──> SurveyRecord/SurveyStatus

Next.js (copy P-185) ──BFF route──> FastAPI /api/v1
   /chat/stream  : BM25 + vector + mở rộng đồ thị ──RRF──> top-k ──LLM [[cite:S1]]──> kiểm trích dẫn ──> SSE
   /classify     : MLP ──bảng chủ đề──> tra cứu theo chủ đề
   /graph/{id}   : lân cận một nút cho trang đồ thị
```

So với P-185 bỏ Postgres, đăng nhập, JWT, LangGraph và tool loop. Hội thoại giữ trong trình duyệt. Gọi `openai` SDK trực tiếp thay cho langchain. Backend dự kiến dưới 1.500 dòng, so với 48 nghìn dòng của P-185.

So với bài tham khảo có ba thay đổi có chủ ý, mỗi thay đổi nhắm vào một điểm yếu bài đó tự ghi nhận.

- Dùng `BAAI/bge-m3` thay cho `multilingual-e5-small`. Bài tham khảo đạt Hit@5 5,56% vì câu hỏi tiếng Việt không khớp đoạn tiếng Anh. bge-m3 truy xuất chéo ngôn ngữ tốt hơn và P-185 đã dùng sẵn.
- Truy xuất lai BM25, vector và đồ thị gộp bằng RRF, kèm thí nghiệm tách từng thành phần. Bài tham khảo chưa đo lợi ích riêng của đồ thị.
- Bộ tham chiếu gán theo nội dung đoạn, chấp nhận nguồn tương đương ở cả hai ngôn ngữ. Bài tham khảo gán theo cả tài liệu.

## Danh sách việc tổng

### Khởi động

- [ ] Trình kế hoạch này cho người dùng rồi dừng. Chỉ bắt đầu khi người dùng nói làm.
- [ ] Đọc lại các leaf skill pstack dùng trong chương trình. `principle-model-the-domain`, `principle-laziness-protocol`, `principle-prove-it-works`, `principle-sequence-verifiable-units`.

### Giao việc cho agent

- [ ] Agent con dùng `subagent_type: "pstack:poteto-agent"`, `model: "sonnet"`, chạy nền. Agent chính giữ thiết kế, review diff và tự viết tóm tắt.
- [ ] Đồ thị phụ thuộc.
  - [ ] U0 chặn mọi việc khác.
  - [ ] U1 và U4 độc lập, chạy song song sau U0.
  - [ ] U2 sau U1. U3 sau U2.
  - [ ] U5 sau U2. U5 dùng U3 khi có, chưa có thì nhánh đồ thị trả rỗng.
  - [ ] U7a (gọt frontend) chạy song song từ sau U0 vì hợp đồng SSE đã chốt ở U0.
  - [ ] U7b (nối API) sau U5 và U4. U6 sau U5 và U3. U8 sau U6.
- [ ] Giữ ranh giới tệp. U1 chỉ sửa `pipeline/fetch*`, `pipeline/sources.yaml`, `data/raw`. U4 chỉ sửa `pipeline/survey*`, `pipeline/train*`, `models/`. U7 chỉ sửa `frontend/`.
- [ ] Neo4j là trạng thái dùng chung. U2, U3 và phần SurveyRecord của U4 ghi trên nhãn rời nhau và đều dùng `MERGE`, nên chạy lại không sinh trùng.

### Cách chạy kiểm live

- [ ] `docker compose up -d neo4j`, chờ `/ready` của backend trả 200.
- [ ] `make api` (uvicorn cổng 8100) và `make web` (Next cổng 3100).
- [ ] Lái giao diện bằng Playwright MCP. Lưu ảnh vào `results/screens/<don-vi>/<slug>.png`.

## Dựng nền móng (U0)

**Phụ thuộc.** Không.

**Tệp.**

- [ ] Tạo `docker-compose.yml` chỉ có `neo4j:5`, cổng host 27474 và 27687, volume `a8_neo4j_data`. Tránh đụng cổng P-185 và các container đang chạy.
- [ ] Tạo `.venv` bằng `uv venv --python 3.11`, `requirements.txt` gồm fastapi, uvicorn, neo4j, sentence-transformers, bm25s, openai, trafilatura, pypdf, pandas, scikit-learn, torch, pyreadstat, pytest.
- [ ] Tạo `.env` chỉ chép ba biến LLM từ `P-185/.env` cùng biến Neo4j. Không in giá trị key ra log.
- [ ] Tạo `backend/app/schema.py` với nhãn, quan hệ, bảng chủ đề, enum trạng thái, kiểu sự kiện SSE.
- [ ] Tạo `Makefile` với `up`, `ingest`, `train`, `api`, `web`, `eval`, `report`.

**Kết quả thấy được.**

- [ ] `make up` xong, `cypher-shell RETURN 1` trả 1.
- [ ] Một lệnh gọi thử LLM trả lời một câu tiếng Việt.

**Kiểm unit.** Test thôi chưa đủ.

- [ ] `tests/test_schema.py` kiểm mọi nhãn dự đoán đều có trong bảng chủ đề.

**Kiểm live.**

- [ ] Mở `http://localhost:27474`, chạy `SHOW CONSTRAINTS`. Lưu `neo4j-constraints.png`. Đạt khi thấy ràng buộc duy nhất trên `id`.

**Kiểm perf.**

- [ ] Ghi thời gian một lần gọi LLM ngắn làm mốc cho U5.

## Thu thập và làm sạch nguồn (U1)

**Phụ thuộc.** U0. Giao cho agent Sonnet.

**Tệp.**

- [ ] Tạo `pipeline/sources.yaml`, khoảng 30 nguồn. Tiếng Việt gồm Vinmec, Bệnh viện 108, Bộ Y tế (hướng dẫn chẩn đoán và điều trị ĐTĐ type 2). Tiếng Anh gồm NIDDK, CDC, WHO, NHS, NDSS, ADA Standards of Care tóm tắt. Mỗi nguồn có id, url, publisher, lang, kind.
- [ ] Tạo `pipeline/fetch.py`. Lưu bản gốc vào `data/raw/<id>.<ext>` kèm sha256. Lỗi tải ghi vào `data/raw/failures.json` rồi bỏ qua.
- [ ] Tạo `pipeline/clean_chunk.py`. HTML qua trafilatura, PDF qua pypdf theo trang. Chia đoạn khoảng 350 token, chồng 50, theo ranh giới đoạn văn. Ra `data/processed/chunks.jsonl`.
- [ ] Bộ lọc quảng cáo và menu bằng danh sách mẫu câu trong `pipeline/boilerplate.txt`, vì bài tham khảo để lọt quảng cáo vào kết quả.

**Kết quả thấy được.**

- [ ] `python -m pipeline.clean_chunk --stats` in số tài liệu, số đoạn theo ngôn ngữ, số đoạn bị lọc.

**Kiểm unit.**

- [ ] `tests/test_chunk.py` với một HTML mẫu có menu và quảng cáo. Kết quả không chứa chuỗi menu, đoạn không vượt 400 token.

**Kiểm live.**

- [ ] Script `pipeline/audit_chunks.py` lấy ngẫu nhiên 30 đoạn, ghi ra `results/chunk_audit.md`. Agent chính đọc hết. Đạt khi không đoạn nào là menu, quảng cáo hoặc rỗng.

**Kiểm perf.**

- [ ] Tải lại lần hai dùng cache, không tải lại tệp có sha256 trùng. Đạt khi lần hai dưới 10 giây.

## Nạp tài liệu và vector vào Neo4j (U2)

**Phụ thuộc.** U1.

**Tệp.**

- [ ] Tạo `pipeline/ingest_docs.py`. `MERGE` Document và Chunk theo `id`, tạo `PART_OF`, tạo vector index `chunk_embedding` 1024 chiều cosine.
- [ ] Nhúng bằng bge-m3 trên MPS, batch 16. Câu hỏi và đoạn dùng cùng mô hình.

**Kết quả thấy được.**

- [ ] Cypher đếm `Document` và `Chunk` khớp `--stats` của U1.

**Kiểm unit.**

- [ ] `tests/test_ingest_idempotent.py` chạy nạp hai lần trên 3 đoạn mẫu. Đạt khi số nút và quan hệ không đổi.

**Kiểm live.**

- [ ] Truy vấn vector bằng câu "triệu chứng của tiền đái tháo đường". Lưu `vector-probe.png` từ Neo4j Browser. Đạt khi top 5 có ít nhất một đoạn tiếng Anh về prediabetes symptoms.

**Kiểm perf.**

- [ ] Đo thời gian nhúng toàn kho và độ trễ `queryNodes` k=20. Ngân sách truy vấn dưới 200 ms.

## Trích dữ kiện y tế có kiểm chứng (U3)

**Phụ thuộc.** U2.

**Tệp.**

- [ ] Tạo `pipeline/extract_facts.py`. LLM đọc từng đoạn, trả JSON theo schema cố định gồm loại dữ kiện, tên, điều kiện áp dụng và `quote` nguyên văn.
- [ ] Kiểm quote bằng code. Quote phải là chuỗi con của đoạn sau khi chuẩn hoá khoảng trắng. Không khớp thì loại và ghi vào `results/facts_rejected.jsonl`.
- [ ] Gộp tên trùng qua bảng đồng nghĩa nhỏ `pipeline/synonyms.yaml` (ví dụ "khát nhiều" và "polydipsia").
- [ ] `MERGE` nút dữ kiện, quan hệ với Disease và `SUPPORTED_BY {quote}` tới Chunk.

**Kết quả thấy được.**

- [ ] Bảng đếm nút và quan hệ theo nhãn in ra `results/graph_stats.json`, làm nguồn cho bảng 5 và bảng 6 của báo cáo.

**Kiểm unit.**

- [ ] `tests/test_quote_check.py`. Quote bịa bị loại, quote đúng nhưng khác khoảng trắng được giữ.

**Kiểm live.**

- [ ] Neo4j Browser chạy `MATCH p=(:Disease {id:'dtd_type2'})-[:HAS_RECOMMENDATION]->()-[:SUPPORTED_BY]->()-[:PART_OF]->() RETURN p LIMIT 25`. Lưu `graph-type2.png`. Đạt khi đủ chuỗi bốn nút như hình 3 của bài tham khảo.

**Kiểm perf.**

- [ ] Ghi số lần gọi LLM và tổng token của bước trích. Đạt khi cả kho chạy một lần không vượt ngân sách người dùng chấp nhận, mặc định 2 triệu token.

## Huấn luyện bộ phân loại khảo sát (U4)

**Phụ thuộc.** U0. Giao cho agent Sonnet, chạy song song với U1 đến U3.

**Tệp.**

- [ ] Tạo `pipeline/survey_sqlite.py`. Nạp `diabetes_012_health_indicators_BRFSS2015.csv` (đã có ở `ass_04`) và tệp BRFSS 2023 `LLCP2023XPT` tải từ CDC vào `data/survey.db`, bảng `survey_records` và `status_definitions`.
- [ ] Bài ba nhóm dùng Diabetes_012. Bài Type 1/2 lọc `DIABETE4=1` và `DIABTYPE` thuộc 1 hoặc 2, loại `DIABETE4`, `DIABAGE4`, `INSULIN1` khỏi đầu vào vì lộ nhãn.
- [ ] Chia 70/15/15 theo nhóm hồ sơ trùng đặc trưng, như bài tham khảo.
- [ ] Tạo `pipeline/train.py`. Ba mô hình là lớp đông nhất, hồi quy logistic, MLP PyTorch (vào, 64, 32, ra; dropout 0,15; Adam 1e-3; batch 512; cross entropy có trọng số lớp; dừng sớm theo macro-F1 xác thực, kiên nhẫn 7, tối đa 40 lượt).
- [ ] Chạy 5 seed, báo trung bình và độ lệch chuẩn. Bài tham khảo chỉ một seed.
- [ ] Hiệu chỉnh xác suất bằng temperature scaling trên tập xác thực, báo ECE trước và sau. Bài tham khảo nêu thiếu bước này.
- [ ] Nạp 600 dòng mẫu (100 mỗi nhóm năm và nhãn) thành SurveyRecord và SurveyStatus.

**Kết quả thấy được.**

- [ ] `results/classifier.json` có accuracy, macro-F1, precision, recall, F1 từng lớp, ma trận nhầm lẫn, cho cả hai bài và ba mô hình.
- [ ] Hình đường học và ma trận nhầm lẫn trong `results/figures/`.

**Kiểm unit.**

- [ ] `tests/test_split.py`. Không hồ sơ nào nằm ở hai tập.
- [ ] `tests/test_predict.py`. Hồ sơ mẫu cố định trả nhãn và xác suất có tổng bằng 1.

**Kiểm live.**

- [ ] Gọi `POST /api/v1/classify` sau khi U5 xong với hồ sơ BMI 40, nhóm tuổi 9. Đạt khi trả nhãn, xác suất đã hiệu chỉnh và chủ đề đúng theo bảng chủ đề.

**Kiểm perf.**

- [ ] Thời gian huấn luyện mỗi seed và độ trễ dự đoán một hồ sơ. Ngân sách dự đoán dưới 20 ms.

## API hỏi đáp RAG (U5)

**Phụ thuộc.** U2, dùng U3 khi có.

**Tệp.**

- [ ] `backend/app/retrieval.py`. Ba nhánh. BM25 bằng bm25s trên âm tiết đã hạ chữ thường. Vector qua `db.index.vector.queryNodes`. Đồ thị lấy đoạn được `SUPPORTED_BY` từ dữ kiện nối với Disease của chủ đề, cùng dữ kiện gắn với đoạn top của hai nhánh kia. Gộp RRF k=60, khử trùng theo chunk id, lấy top 6.
- [ ] `backend/app/answer.py`. Prompt tiếng Việt, ngữ cảnh đánh alias S1 đến S6, yêu cầu trích `[[cite:Sn]]` sau mỗi ý. Kiểm sau sinh. Alias không có trong ngữ cảnh bị gỡ. Câu trả lời không còn trích dẫn nào chuyển thành `insufficient_evidence`.
- [ ] Cổng phạm vi. Điểm RRF cao nhất dưới ngưỡng hoặc bộ phân loại chủ đề nhỏ trả ngoài lĩnh vực thì `out_of_scope`, không gọi LLM. Ngưỡng chọn trên tập dev của U6.
- [ ] Lời miễn trừ y tế cố định ở mọi câu trả lời.
- [ ] `backend/app/main.py`. Route `POST /api/v1/chat/stream`, `POST /api/v1/classify`, `GET /api/v1/graph/{node_id}`, `GET /api/v1/sources/{chunk_id}`, `GET /ready`.

**Kết quả thấy được.**

- [ ] `curl -N` vào `/chat/stream` thấy đủ chuỗi sự kiện từ `stream.started` đến `stream.completed`.

**Kiểm unit.**

- [ ] `tests/test_rrf.py` với ba danh sách nhỏ có đáp án tay.
- [ ] `tests/test_citation_gate.py`. Alias S9 bịa bị gỡ, câu trả lời rỗng trích dẫn ra `insufficient_evidence`.
- [ ] `tests/test_sse_contract.py` so tên sự kiện với `frontend/src/lib/chat-stream-contract.ts`.

**Kiểm live.**

- [ ] Ba câu hỏi thật qua `curl`. Một câu khái niệm, một câu ăn uống, một câu ngoài phạm vi ("giá vàng hôm nay"). Lưu output vào `results/api_probe.txt`. Đạt khi hai câu đầu `answered` có nguồn, câu ba `out_of_scope`.

**Kiểm perf.**

- [ ] Đo độ trễ truy xuất và thời gian tới token đầu trên 20 câu. Ngân sách truy xuất p50 dưới 500 ms, token đầu p50 dưới 3 giây.

## Đánh giá truy xuất và câu trả lời (U6)

**Phụ thuộc.** U5 và U3.

**Tệp.**

- [ ] `eval/questions.jsonl`, 30 câu. 22 câu tiếng Việt trong phạm vi, 4 câu tiếng Anh, 4 câu ngoài phạm vi. Nhóm nội dung gồm khái niệm, triệu chứng, nguy cơ, ăn uống, thuốc, tổng hợp.
- [ ] Gán tham chiếu theo nội dung. Gộp top 20 của mọi nhánh làm ứng viên, LLM chấm mỗi đoạn có chứa ý trả lời hay không, agent chính đọc lại toàn bộ nhãn dương. Ghi quy trình vào báo cáo.
- [ ] `eval/run_eval.py`. Recall@k, Hit@k với k bằng 3 và 5, MRR@10. Bốn cấu hình BM25, vector, BM25 cộng vector, đủ ba nhánh.
- [ ] Chất lượng câu trả lời. Tách câu trả lời thành phát biểu, LLM chấm từng phát biểu có được đoạn trích dẫn hỗ trợ hay không. Báo tỷ lệ phát biểu được hỗ trợ, độ chính xác trích dẫn, độ chính xác từ chối trên 4 câu ngoài phạm vi.
- [ ] Ghi kết quả vào `results/eval.json` kèm thời điểm chạy và cấu hình.

**Kết quả thấy được.**

- [ ] Bảng bốn cấu hình in ra terminal và vào `results/eval.md`.

**Kiểm unit.**

- [ ] `tests/test_metrics.py`. Ví dụ tham chiếu {a,b}, kết quả {a,c,d} cho Recall@3 bằng 0,5 và Hit@3 bằng 1, như công thức trong bài tham khảo.

**Kiểm live.**

- [ ] Đọc tay 10 câu trả lời ngẫu nhiên cùng nguồn. Đạt khi nhận định của người đọc khớp với điểm LLM chấm ở ít nhất 8 câu. Lệch nhiều hơn thì sửa prompt chấm trước khi dùng số.

**Kiểm perf.**

- [ ] Giải thích con số. Nếu đủ ba nhánh không hơn BM25 cộng vector thì ghi rõ trong báo cáo, không giấu.

## Giao diện web từ P-185 (U7)

**Phụ thuộc.** U7a sau U0. U7b sau U5 và U4. U7a giao cho agent Sonnet.

**Tệp.**

- [ ] U7a. Copy `P-185/frontend` sang `frontend/`, bỏ `node_modules`, `.next`, `out-pages`, `test-results`, các script `audit*.mjs`, `do-*.mjs`, `v.mjs`.
- [ ] U7a. Xoá trang và thành phần thuế. `accountant/*`, `expert/*`, `he-thong`, máy tính thuế, rà bảng lương, escalation, tờ khai, `components/marketing/*`, `components/design-system-v3`, `design-system-v4`, `concepts`, `app/internal/*`, `about`, `privacy`, `terms`.
- [ ] U7a. Bỏ đăng nhập. Middleware cho qua mọi request, xoá cookie `drakefamtax-role` và vai trò kế toán.
- [ ] U7a. Đổi thương hiệu sang "Tra cứu Đái tháo đường". Chỉ giữ font Manrope, bỏ Neue Plak vì giấy phép chưa rõ.
- [ ] U7a. Đổi chip trạng thái hiệu lực văn bản thành nhãn ngôn ngữ và đơn vị xuất bản của nguồn.
- [ ] U7b. Ba route. `/app/chat` giữ khung chat stream và panel nguồn. `/app/do-thi` hiển thị lân cận một nút từ `/graph/{id}`, dựa trên `document-relations-inspector`. `/app/phan-loai` là form 21 trường khảo sát, ra nhãn, xác suất và nút "Tra cứu theo chủ đề này" mở chat đã lọc chủ đề.
- [ ] U7b. `API_BASE_URL` trỏ `http://localhost:8100/api/v1`.

**Kết quả thấy được.**

- [ ] `grep -riE "thuế|drakefam|P-185" frontend/src` không còn kết quả.
- [ ] `npm run build` và `npm run lint` sạch.

**Kiểm unit.**

- [ ] Giữ các test vitest của parser, reducer và hợp đồng SSE. Xoá test của thành phần đã xoá. `npm test` xanh.

**Kiểm live.** Playwright MCP trên `http://localhost:3100`.

- [ ] Làn 1. Hỏi "Người bị tiền đái tháo đường nên ăn gì?". Lưu `chat-diet.png`. Đạt khi chữ hiện dần, có ít nhất một trích dẫn, bấm trích dẫn mở đúng đoạn nguồn.
- [ ] Làn 2. Hỏi câu ngoài phạm vi. Lưu `chat-oos.png`. Đạt khi hiện trạng thái từ chối, không có nguồn bịa.
- [ ] Làn 3. Trang phân loại với hồ sơ mẫu. Lưu `classify.png`. Đạt khi hiện nhãn, xác suất và chuyển sang chat có chủ đề.
- [ ] Làn 4. Trang đồ thị với `dtd_type2`. Lưu `graph.png`. Đạt khi thấy chuỗi Disease, Recommendation, Chunk, Document.
- [ ] Làn 5. Bố cục ở 1440 và 375 px. Lưu `w1440.png`, `w375.png`. Đạt khi `scrollWidth === clientWidth`, theo bất biến full-width trong `P-185/AGENTS.md`.

**Kiểm perf.**

- [ ] Thời gian từ bấm gửi tới ký tự đầu trên giao diện, đo bằng Playwright. Ngân sách p50 dưới 3,5 giây.

## Viết báo cáo LaTeX (U8)

**Phụ thuộc.** U6.

**Tệp.**

- [ ] `report/main.tex` cùng preamble theo các bài trước (`ass_02/A2_02_TranXuanThanh_280`). Chín mục theo bố cục tham khảo. Giới thiệu, Dữ liệu, Thiết kế hệ thống, Hệ thống hỏi đáp RAG, Thực nghiệm phân loại, Kết quả hỏi đáp, Tích hợp và thảo luận, Kết luận, Tài liệu tham khảo.
- [ ] Mọi số liệu đọc từ `results/*.json` qua script `report/gen_tables.py` sinh tệp `.tex`. Không gõ số bằng tay.
- [ ] Thêm hai mục bài tham khảo không có. Thí nghiệm tách thành phần truy xuất, và độ ổn định qua 5 seed.
- [ ] Không chép câu chữ hay số liệu của bài tham khảo. Chỉ dùng bố cục.

**Kết quả thấy được.**

- [ ] `tectonic report/main.tex` ra `A8_02_TranXuanThanh_280.pdf`.

**Kiểm unit.**

- [ ] `report/gen_tables.py --check` so mọi số trong `.tex` sinh ra với `results/*.json`.

**Kiểm live.**

- [ ] Đọc PDF từng trang. Đạt khi không còn hộp tràn lề, hình có chú thích, số bảng khớp kết quả.

**Kiểm perf.**

- [ ] Không áp dụng. Báo cáo không có đường chạy cần đo.

## Đóng chương trình

- [ ] Mọi ô ở trên đã tick kèm bằng chứng.
- [ ] `README.md` ghi cách chạy lại từ đầu bằng `make` và bảng đề bài tới nơi trả lời, như README của A7.
- [ ] Trả lời người dùng với đường dẫn PDF, bảng số liệu chính và những gì chưa đạt.

## Phụ lục A. Bằng chứng prototype

Chưa chạy prototype. Ba câu hỏi thực nghiệm sẽ được trả lời bằng chạy thử ở đầu đơn vị tương ứng, không hỏi người dùng.

- Tốc độ tải tệp BRFSS 2023 từ CDC. Nếu chậm như CIFAR từ toronto thì tìm bản mirror trên Kaggle hoặc HuggingFace (U4).
- bge-m3 trên MPS có nhúng 500 đến 1.000 đoạn trong vài phút không (U2).
- Endpoint LLM của P-185 còn hạn mức không và có trả JSON ổn định cho bước trích dữ kiện không (U0).

## Phụ lục B. Phương án đã loại

| Phương án | Lý do loại |
|---|---|
| Qwen2.5-1.5B chạy local | Người dùng chọn API. Bài tham khảo cho thấy mô hình nhỏ hay thêm ý ngoài nguồn. |
| Giữ Postgres, JWT, LangGraph của P-185 | Không phục vụ mục tiêu bài. Tăng mã cần bảo trì gấp nhiều lần. |
| Vector DB riêng (Chroma, FAISS) | Bài yêu cầu Neo4j. Index vector trên nút Chunk đủ dùng, giống ADR-003 của P-185. |
| Gõ tay 38 dữ kiện như bài tham khảo | Không mở rộng được. LLM trích kèm kiểm quote bằng code cho số dữ kiện lớn hơn và vẫn truy vết được. |
| Copy nguyên frontend rồi đổi chữ | Mang theo khoảng 10 nghìn dòng phòng thí nghiệm thiết kế và marketing không dùng. |

## Phụ lục C. Rủi ro

| Rủi ro | Đơn vị | Theo dõi |
|---|---|---|
| Trang y tế chặn bot hoặc đổi cấu trúc | U1 | `failures.json`. Thay nguồn cùng đơn vị xuất bản. |
| bge-m3 cần khoảng 2 GB tải về | U2 | Kiểm cache HuggingFace trước. Thiếu thì tải một lần. |
| Frontend P-185 phụ thuộc chéo nhiều, xoá một thành phần làm vỡ build | U7a | Xoá theo từng nhóm, `npm run build` sau mỗi nhóm. |
| LLM chấm điểm thiên lệch | U6 | Làn đọc tay 10 câu trước khi tin số. |
| Câu trả lời y tế bị hiểu là tư vấn điều trị | U5 | Lời miễn trừ cố định, từ chối khi thiếu bằng chứng. |
| Hạn nộp chưa biết | Tất cả | Hỏi người dùng. Nếu gấp thì cắt U7 trang đồ thị trước. |

## Phụ lục D. Tài liệu đọc trước

- `P-185/docs/architecture_diagram.md` và `P-185/docs/integration.md` cho hợp đồng API và `sources[]`.
- `P-185/src/models/chat_stream.py` cho envelope SSE.
- `P-185/src/services/ingestion.py` dòng 175 đến 224 làm mẫu `MERGE`.
- `P-185/src/agents/tools/fusion.py` cho RRF.
- `P-185/frontend/src/lib/chat-stream-contract.ts`, `chat-stream-parser.ts`, `chat-stream-reducer.ts`.
- `ass_08/graph_02_HungNguyenBa_120.pdf` cho bố cục báo cáo.
