# Diabeque — hệ đa agent hỗ trợ sàng lọc và tư vấn đái tháo đường

![Diabeque](assets/diabeque-mark.svg)

**Diabeque** = *Diabetes* + *Basque*: logo là chiếc mũ nồi xứ Basque, cuống mũ là giọt máu màu xanh của biểu tượng đái tháo đường.

Nhóm 02 — Intelligent System Development, học kỳ I.2026. Tiểu luận Final, phần project (hạn 17/11).

Hệ thống ước lượng nguy cơ và tư vấn có nguồn; **không chẩn đoán**. Nhãn huấn luyện là câu trả lời khảo sát tự báo cáo (BRFSS).

## Thành phần → mục báo cáo

| Mục | Thành phần | Mã |
|---|---|---|
| 2. Kiến trúc hệ đa agent | 6 agent trên LangGraph, trạng thái chung có lược đồ, 2 lớp kiểm an toàn | `backend/app/agents/` |
| 3. Data | BRFSS 2015 + 2023 (686.019 dòng, 19 đặc trưng), kho 35 tài liệu | `data/survey.db` (từ A8), Neo4j `KB_diabet` |
| 4. Deep learning cho Diabetes | So sánh MLP / CNN-1D / LSTM, chọn theo macro-F1 tập xác thực | `backend/app/nets.py`, `pipeline/train_dl.py` |
| 5. KB + RAG | Dùng lại pipeline A8 (Chương 5 tiểu luận) làm công cụ `search_knowledge`, `get_recommendations` | `backend/app/retrieval.py`, `answer.py` |
| 6. Code_Demo | API SSE (sự kiện `agent.step`), giao diện Next.js có bảng vết chạy agent | `backend/app/main.py`, `frontend/` |
| Đánh giá | Ý định, trích xuất hồ sơ, an toàn, hội thoại nhiều lượt; so với một agent duy nhất | `eval/` |

## Các agent

| Agent | Việc | Công cụ / cách làm |
|---|---|---|
| An toàn (vào) | Phát hiện dấu hiệu khẩn cấp, dừng luồng | luật (regex), `safety.py` |
| Điều phối | Phân loại ý định: knowledge / assess_risk / greeting / out_of_scope | LLM gọi công cụ `IntentDecision`; luật dự phòng |
| Thu thập thông tin | Điền 7 trường bắt buộc, hỏi tối đa 3 câu mỗi lượt | LLM `IntakeExtraction` + luật, `compute_bmi`, `validate_profile` |
| Dự đoán nguy cơ | Gọi mô hình đã chọn; xác suất bỏ trọng số lớp | `predict_diabetes_risk`, `predict_diabetes_type` |
| Tra cứu tri thức | RAG của A8, có cổng trích dẫn | `search_knowledge` |
| Tư vấn | Lời khuyên theo yếu tố nguy cơ trong hồ sơ, có trích dẫn | `get_recommendations` + LLM + cổng trích dẫn |
| An toàn (ra) | Bỏ câu có liều thuốc / kết luận chẩn đoán; câu không còn trích dẫn thì thay | luật, `safety.py` |

## Chạy lại

Venv, `.env` và Neo4j dùng chung ở gốc repo; KB do `chap5-rag` nạp. Xem [../DEPLOY.md](../DEPLOY.md). Từ thư mục này:

```bash
make api                  # FastAPI cổng 8200
make web                  # Next.js cổng 3200
make test                 # pytest, không cần LLM hay Neo4j
make eval                 # kịch bản đánh giá, ghi results/agent_eval.json (gọi LLM)
make train                # cần data/survey.db (liên kết từ ../chap5-rag/data); ghi models/ và results/dl_compare.json
../.venv/bin/python -m eval.client "Tôi 52 tuổi, nam, cao 1m65, nặng 80kg, bị huyết áp cao. Tôi có nguy cơ không?"
```

## Kết quả mục 4 — deep learning (`results/dl_compare.json`, 3 seed, trung bình ± độ lệch chuẩn)

| Bài | Mô hình | Macro-F1 xác thực | Macro-F1 kiểm tra | Accuracy | Tham số | Huấn luyện / seed | Suy luận 1 dòng |
|---|---|---|---|---|---|---|---|
| Ba nhóm | MLP | 0,4259 ± 0,0000 | 0,4260 ± 0,0024 | 0,640 | 3.459 | 12 s | 0,016 ms |
| Ba nhóm | **CNN-1D** (chọn) | 0,4305 ± 0,0039 | 0,4309 ± 0,0018 | 0,648 | 7.459 | 678 s | 0,091 ms |
| Ba nhóm | LSTM | 0,4291 ± 0,0034 | 0,4293 ± 0,0015 | 0,645 | 15.587 | 457 s | 0,338 ms |
| Type 1/2 | MLP | 0,5363 ± 0,0089 | 0,5422 ± 0,0061 | 0,723 | 3.426 | 0,3 s | 0,017 ms |
| Type 1/2 | CNN-1D | 0,5559 ± 0,0174 | 0,5689 ± 0,0135 | 0,780 | 7.426 | 15 s | 0,083 ms |
| Type 1/2 | **LSTM** (chọn) | 0,5686 ± 0,0209 | 0,5745 ± 0,0157 | 0,807 | 15.554 | 9 s | 0,367 ms |

CNN-1D và LSTM đọc 19 đặc trưng như chuỗi 19 token (token = giá trị × vector riêng của đặc trưng + vector vị trí).
Ở bài ba nhóm, khoảng cách giữa ba kiến trúc chỉ cỡ một đến hai độ lệch chuẩn, trong khi CNN-1D tốn thời gian huấn luyện
gấp khoảng 55 lần MLP. Ở bài Type 1/2 (22.027 dòng) hai mô hình chuỗi hơn MLP rõ hơn, nhưng độ lệch giữa các seed lớn.
Mô hình được chọn theo macro-F1 tập xác thực; tập kiểm tra chỉ để báo cáo. Ba seed MLP bài ba nhóm cho macro-F1 xác thực
0,42593 / 0,42592 / 0,42595 (khác nhau, chỉ trùng ở bốn chữ số đầu).

## Kết quả đánh giá agent (`results/agent_eval.json`)

| Bộ kịch bản | Hệ đa agent | Một agent duy nhất |
|---|---|---|
| Ý định (22 câu) | 22/22 | — |
| Trích xuất hồ sơ (8 câu, 42 trường) | LLM 93% · luật 83% · gộp 98% | — |
| An toàn (11 câu: liều thuốc, chẩn đoán, khẩn cấp, câu bình thường) | 11/11 | 11/11 |
| Hội thoại nguy cơ (4 hội thoại): tới bước dự đoán | 4/4 | 4/4 |
| Trường hồ sơ đưa vào mô hình đúng | 28/28 | 21/28 |
| Trích dẫn trung bình trong lời khuyên | 10,0 | 5,5 |
| Số lần gọi LLM / tổng thời gian | 18 / 21 s | 19 / 27 s |

Mốc một agent sai nhóm tuổi BRFSS ở 3/4 hội thoại (lần chạy cuối: 52 tuổi thành nhóm 8, 40 tuổi thành nhóm 8) và sai mức
sức khỏe chung ở 4/4 (“trung bình” thành 3, “tốt” thành 1), dù quy tắc mã hóa có trong lời nhắc. Hệ đa agent làm phép ánh xạ này bằng code trong agent
thu thập. Trên bộ an toàn nhỏ này hai hệ ngang nhau.

Lần đánh giá đầu (`results/agent_eval_v1_before_fix.json`) cho LLM trích xuất chỉ đúng 38%: ép `tool_choice` khiến
endpoint trả về 2/8 tham số. Sau khi chỉ đưa công cụ (không ép) và chuẩn hóa giá trị giới tính, tỷ lệ là 93%.

## Báo cáo

`../docs/Diabeque_02_TranXuanThanh_280.pdf` (17 trang, 7 mục theo đề) dựng bằng `make report`; mọi số liệu sinh từ `results/*.json` qua `report/gen_tables.py`.

## Ghi chú

- Câu “Tôi nên tiêm insulin liều bao nhiêu?” từng bị điều phối sang thu thập hồ sơ (do luật dự phòng “tôi nên”); đã sửa lời nhắc điều phối và thêm 2 câu vào bộ ý định.

- Neo4j dùng chung với chap5-rag; `data/`, `.env`, `.venv` không kèm repo. Không có `survey.db` thì API đọc `models/<task>/class_counts.json`.
- Bộ kịch bản nhỏ và do người viết gán nhãn; chưa có chuyên gia y tế đánh giá.
