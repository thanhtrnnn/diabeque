# Demo Chương 5 + Chương 6

Khoảng 12 phút: Chương 5 khoảng 4 phút, Chương 6 khoảng 7 phút, còn lại hỏi đáp.

## Thông tin cần nhớ

### Chương 5: KB + RAG

| Mục | Giá trị |
|---|---|
| Nguồn KB | 35 tài liệu: **28 link** (trang web) + **7 file PDF** (hướng dẫn của Bộ Y tế, ...); 13 tiếng Việt, 22 tiếng Anh |
| Nhà xuất bản chính | Bộ Y tế, NIDDK, NHS, ADA, WHO, Vinmec, Tâm Anh, BV TWQĐ 108, MedlinePlus, Diabetes UK |
| Pipeline | tải (`trafilatura`, `pypdf`) → làm sạch, chia đoạn → nhúng `BAAI/bge-m3` → Neo4j → LLM trích dữ kiện có kiểm câu trích |
| Đồ thị `KB_diabet` | 35 Document, 424 Chunk, 5 Disease, 219 Symptom, 257 Complication, 276 RiskFactor, 840 Recommendation, 191 DrugClass, 600 SurveyRecord |
| Truy xuất | lai: vector + BM25 + mở rộng qua đồ thị; xếp hạng bằng vector (gộp đồ thị vào RRF làm MRR giảm) |
| Kết quả truy xuất (26 câu) | vector bge-m3: **Hit@5 1,000 · MRR@10 0,792** |
| Kết quả trả lời | 25/26 câu được trả lời · **97,9% phát biểu có nguồn hỗ trợ** · **4/4 câu ngoài phạm vi bị từ chối** |
| Cổng trích dẫn | câu không có nguồn bị bỏ; chuẩn hóa kiểu trích dẫn lạ của gemma (`[[S5]]`, `[[1, 3]]`) |
| Ngưỡng ngoài phạm vi | cosine lớn nhất < 0,78 thì từ chối |

### Chương 6: hệ đa agent Diabeque

| Mục | Giá trị |
|---|---|
| Framework | LangGraph, 7 nút: An toàn (vào) → Điều phối → Thu thập / Tra cứu / Dự đoán / Tư vấn → An toàn (ra) |
| Nguyên tắc | LLM chỉ làm 3 việc cần hiểu ngôn ngữ (ý định, trích hồ sơ, viết lời khuyên); mã hóa BRFSS, BMI, an toàn là code |
| Hồ sơ bắt buộc | 7 trường; hỏi tối đa 3 câu mỗi lượt; bộ nhớ phiên là `InMemorySaver` (mất khi khởi động lại) |
| Dữ liệu | BRFSS 2015 + 2023: 686.019 dòng, 19 đặc trưng |
| Mô hình ba nhóm | **CNN-1D**, macro-F1 xác thực 0,4305 ± 0,0039 (MLP 0,4259, LSTM 0,4291); huấn luyện lâu gấp khoảng 55 lần MLP |
| Mô hình Type 1/2 | **LSTM**, macro-F1 xác thực 0,5686 ± 0,0209 (22.027 dòng) |
| Hiệu chỉnh xác suất | bỏ trọng số lớp, đưa về tần suất thật; ECE 0,088 → 0,006 |
| Ý định | 22/22 câu |
| Trích xuất hồ sơ (42 trường) | LLM 93% · luật 83% · gộp 98% |
| An toàn | 11/11, ngang hệ một agent duy nhất |
| Trường hồ sơ đưa vào mô hình đúng | **đa agent 28/28 · một agent 21/28** (một agent tự đổi sai nhóm tuổi ở 3/4 hội thoại) |
| Trích dẫn trung bình trong lời khuyên | đa agent 10,0 · một agent 5,5 |
| Kiểm thử | 31 test cho agent (+ 37 test RAG), không cần LLM |
| Bài học | ép `tool_choice` khiến gemma trả 2/8 tham số (38% đúng); chỉ đưa công cụ, không ép: 93% |

## Chuẩn bị (trước giờ demo 15 phút)

```bash
make up        # Neo4j + 4 server; cuối cùng in bảng 4 cổng và {"chunks":424,...}
make check     # chạy lại bất cứ lúc nào
make down      # sau demo
```

- Cần mạng tới LLM. Không có mạng thì luồng chào hỏi và khẩn cấp vẫn chạy; tra cứu và tư vấn sẽ lỗi.
- Mở sẵn 4 tab: `localhost:3100`, `localhost:3200`, `localhost:3200/app/kien-truc`, `localhost:27474`.
- **Gửi thử mỗi câu dưới đây một lần.** Lần đầu chậm vì nạp bge-m3.
- Trình duyệt để trống lịch sử hội thoại; tắt thông báo; cửa sổ khoảng 1440 px để thấy đủ 3 cột, kể cả bảng vết chạy agent.

## Phần 1: Chương 5 (tab `localhost:3100`)

| # | Thao tác | Nói gì |
|---|---|---|
| 1 | Neo4j Browser: `MATCH (d:Document)<-[:PART_OF]-(c:Chunk) RETURN d, c LIMIT 60`, rồi `MATCH p=(:Disease)-[:HAS_SYMPTOM]->(:Symptom)-[:SUPPORTED_BY]->(:Chunk) RETURN p LIMIT 25` | KB từ **link** và **file PDF**, 424 đoạn, vector bge-m3. Đồ thị có nút bệnh, triệu chứng, biến chứng, khuyến nghị, nhóm thuốc; mỗi dữ kiện trỏ về đoạn văn gốc. |
| 2 | Chat: **"Người bệnh đái tháo đường nên ăn gì?"** (khoảng 12 s) | Mỗi ý có số trích dẫn; bấm "Xem nguồn gốc" mở đoạn văn gốc. Câu không có nguồn bị cổng trích dẫn bỏ. |
| 3 | Chat: **"Biến chứng thần kinh do đái tháo đường có triệu chứng gì?"** | Truy xuất lai; nhãn "Vector" / "Đồ thị" dưới mỗi nguồn. |
| 4 | Chat: **"Ai vô địch World Cup 2022?"** | Ngoài phạm vi: từ chối, không bịa. |
| 5 | (tùy thời gian) trang **Đồ thị** | Duyệt nút tri thức quanh một khái niệm. |

Chốt: RAG này được dùng lại nguyên vẹn làm công cụ `search_knowledge` và `get_recommendations` ở Chương 6.

## Phần 2: Chương 6 (tab `localhost:3200`)

| # | Thao tác | Nói gì |
|---|---|---|
| 1 | Trang **Kiến trúc** | 7 nút LangGraph; LLM chỉ làm phần cần hiểu ngôn ngữ. |
| 2 | Hội thoại mới: **"Xin chào, bạn làm được gì?"** | Ý định `greeting`; chỉ bảng **Quá trình các agent**. |
| 3 | **"HbA1c bao nhiêu thì được chẩn đoán đái tháo đường?"** | Điều phối → Tra cứu (RAG Chương 5) → An toàn (ra). Đáp án ≥ 6,5%, có trích dẫn. |
| 4 | Hội thoại mới: **"Tôi 52 tuổi, nam, cao 1m65, nặng 80kg, bị huyết áp cao. Tôi có nguy cơ tiểu đường không?"** | Thu thập ghi 4 trường (nhóm tuổi 50–54, BMI 29,4 tính bằng code), hỏi 3 trường còn thiếu; cột phải hiện hồ sơ. |
| 5 | **"Mỡ máu bình thường, tôi ít vận động, sức khỏe chung trung bình"** (6–20 s) | Vết chạy 6 bước. CNN-1D: **62% / 3% / 35%**, xác suất đã hiệu chỉnh. *Ước lượng, không phải chẩn đoán*; lời khuyên có trích dẫn. |
| 6 | Hội thoại mới: **"Tôi nên tiêm bao nhiêu đơn vị insulin mỗi ngày?"** | An toàn (ra) bỏ câu có liều (cờ `dosage_removed`), thêm thông báo không đưa liều. |
| 7 | Hội thoại mới: **"Mẹ tôi tiêm insulin xong thì lú lẫn, vã mồ hôi, gọi không trả lời"** | An toàn (vào) dừng ngay: 2 bước, 0 ms, không gọi LLM; khuyên gọi 115. |
| 8 | (tùy thời gian) **"Giá vàng hôm nay bao nhiêu?"** | Ngoài phạm vi. |

Chốt bằng số đo (bảng 6.5 tiểu luận): an toàn 11/11 ở cả hai hệ; khác biệt nằm ở hồ sơ đưa vào mô hình, đa agent 28/28, một agent 21/28.

Kết quả kiểm lại ngày 09/11 trên repo này (KB nạp từ dump): bước 3 có "HbA1c từ 6,5% trở lên [1][2]",
bước 5 ra đúng 62% / 3% / 35%, bước 7 chạy 0 ms qua 2 nút, câu World Cup bị từ chối.

## Nếu có sự cố

| Triệu chứng | Xử lý |
|---|---|
| Treo ở bước tra cứu / tư vấn | lỗi gọi LLM; chuyển sang bước 7 (không cần LLM) và mở Hình 6.4, 6.5 trong `docs/tieuluanFinal_02_nhom02_TranXuanThanh.pdf` |
| `make check` báo 8100/8200 không chạy | xem `.demo-logs/*-api.log`; thường do Neo4j chưa sẵn sàng; `make up` lại |
| `{"chunks":0}` | `make kb-restore` |
| Câu chữ khác lần thử | LLM không tất định; trích dẫn, cờ an toàn, vết chạy giữ nguyên cấu trúc |

## Câu hỏi có thể gặp

- **Sao không dùng một agent?** Đã đo: một agent dùng cùng công cụ vẫn mã hóa sai nhóm tuổi ở 3/4 hội thoại. Tách agent cho phép làm phần xác định bằng code và kiểm thử riêng (31 test).
- **Mô hình có chẩn đoán được không?** Không. Nhãn BRFSS là tự báo cáo; macro-F1 ba nhóm khoảng 0,43, lớp tiền đái tháo đường gần như không học được. Hệ thống chỉ ước lượng và khuyên đi xét nghiệm.
- **Sao chọn CNN-1D mà không phải MLP?** Macro-F1 xác thực cao nhất (0,4305 so với 0,4259), nhưng chênh lệch chỉ cỡ 1–2 độ lệch chuẩn, đổi lại huấn luyện lâu gấp khoảng 55 lần. Đã nêu trong Chương 2.
- **KB lấy từ đâu?** 28 link và 7 file PDF, danh sách ở `chap5-rag/pipeline/sources.yaml`; Chương 5, mục 5.3.
- **Lưu dữ liệu người dùng thế nào?** Chỉ trong bộ nhớ phiên (`InMemorySaver`), mất khi khởi động lại.
- **Triển khai thế nào?** `DEPLOY.md`: local bằng Makefile, hoặc Docker Compose 5 container; KB nạp từ dump 6 MB.
