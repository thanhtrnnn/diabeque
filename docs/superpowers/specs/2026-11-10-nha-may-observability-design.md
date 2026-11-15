# Nhà máy Diabeque: observability, dự phòng LLM, tệp Cypher

Ngày 10/11/2026. Repo `tieuluan_final/diabeque`. Ba phần việc độc lập, làm theo thứ tự B → A → C
(B đổi dữ liệu mà A hiển thị; C không phụ thuộc hai phần kia).

Đã tách khỏi phạm vi này: phụ lục dataset của tiểu luận, do session TIEULUAN làm (đã xong).

## Vì sao

Demo trước giảng viên trên máy chiếu. Trang "Kiến trúc" hiện có chỉ là sơ đồ tĩnh, và bảng vết chạy là danh sách
chữ. Người xem cần **thấy** hệ đa agent chạy với câu hỏi thật:
- agent nào đang làm, gọi tool nào;
- Điều phối rẽ nhánh nào;
- vòng lặp hỏi lại qua nhiều lượt và bộ nhớ phiên;
- chuyện gì xảy ra khi LLM hoặc tool lỗi;
- bấm vào bất kỳ thứ gì thì mở đúng dòng code.

Thành công: xem một hai câu hỏi chạy là hiểu kiến trúc, không cần đọc sơ đồ.

Bối cảnh sản phẩm đầy đủ: [PRODUCT.md](../../../PRODUCT.md). Hướng hình ảnh đã chốt:
`.impeccable/surfaces/chap6-agents-frontend-src-app-app-nha-may-page-tsx.md` (direction contract, seed `a8f9a5ef`).

## Đã chốt với user

| Điểm | Quyết định |
|---|---|
| Người xem | giảng viên, máy chiếu 16:9 |
| Nguồn chạy | live theo câu hỏi thật (API 8200) + kịch bản dựng sẵn khi mất mạng |
| Lỗ hổng LLM ở Tra cứu / Tư vấn | thêm dự phòng thật, có test |
| Đồ họa | three.js, diorama 3D isometric, camera orthographic cố định |
| Thế giới hình ảnh | Xưởng đường và sô-cô-la, đọc trái sang phải (user chọn trên trang quyết định) |
| Vòng lặp agent | gồm (1) vòng hỏi lại qua nhiều lượt nhờ bộ nhớ phiên, (2) đường dự phòng khi tool/LLM lỗi |
| Nhân vật | nhân vật gốc, có hình dáng và tương tác riêng; không dùng tên, nhân vật, hình ảnh từ phim/sách nào |

## A. Trang Nhà máy (`/app/nha-may`, frontend chương 6, cổng 3200)

### Thế giới

Xưởng kẹo làm toàn bằng kẹo:
- nền là sô-cô-la bóng tối màu; phòng là nồi/chuông kính đường; ống dẫn là kẹo cam thảo xoắn;
- mây LLM là kẹo bông; hầm KB là hầm sô-cô-la nhìn qua mặt cắt phía trước bệ.
- **Phòng chỉ chạy code** là chuông kẹo cứng trong suốt. **Phòng gọi LLM** có ống kẹo bông nối lên mây.
  Phân biệt bằng hình khối, không chỉ bằng màu.
- Palette, font (Baloo 2 + Be Vietnam Pro), bố cục khung đầu: theo direction contract.

### Bố cục (bám đúng `graph.py`)

- **Dây chính, trái sang phải:** Cửa vào → An toàn (vào) → Điều phối → Thu thập → Dự đoán → Tư vấn → An toàn (ra) → Trả lời.
- **Nhánh knowledge:** Điều phối → Tra cứu (phòng phía trước, thấp hơn) → An toàn (ra).
- **Nhánh greeting / out_of_scope:** Điều phối → thẳng An toàn (ra).
- **Nhánh khẩn cấp:** An toàn (vào) → thẳng An toàn (ra), 0 ms, không LLM.
- **Nhánh thiếu trường:** Thu thập → An toàn (ra) (hết lượt, hỏi tối đa 3 câu).
- **Vòng lặp:** Trả lời → về Cửa vào (lượt sau). Két nhớ (`InMemorySaver`) là một vật trong xưởng; sáng lên khi
  Thu thập đọc/ghi hồ sơ và khi An toàn (ra) ghi lịch sử.
- **Hầm KB (Chương 5):** 3 mũi khoan (vector, BM25, đồ thị) → máy trộn xếp hạng → cổng trích dẫn; khối Neo4j.
  Một dải nhỏ kể dây chuyền dựng KB offline (28 link + 7 PDF → 424 đoạn → bge-m3 → Neo4j → trích dữ kiện).
  Tra cứu đi thang máy xuống hầm; Tư vấn lấy qua vòi khuyến nghị.
- **Tool là máy đặt trong phòng gọi nó:**
  - Thu thập: `compute_bmi`, `validate_profile`
  - Dự đoán: `predict_diabetes_risk` (CNN-1D), `predict_diabetes_type` (LSTM)
  - Tra cứu: `search_knowledge`
  - Tư vấn: `get_recommendations`

### Nhân vật (7, tên tạm, user có thể đổi)

| Nhân vật | Agent | Đạo cụ / tương tác |
|---|---|---|
| Bác Gác Cổng | An toàn (vào) | thổi còi khi khẩn cấp |
| Cô Bẻ Ghi | Điều phối | kéo cần gạt làm **ray thật sự đổi hướng**; lật sổ luật khi LLM sập |
| Chú Sổ Tay | Thu thập | ghi bảng kẹp; số trường x/7 |
| Cụ Cân Đong | Dự đoán | cân nghiêng theo xác suất |
| Bé Đèn Pin | Tra cứu | đội mũ đèn, xuống hầm |
| Chị Pha Chế | Tư vấn | rót bình |
| Ông Soát Vé | An toàn (ra) | đóng dấu; dấu đỏ khi bỏ câu có liều thuốc |

- Dựng bằng khối hình học low-poly có ánh sáng và bóng đổ (không dùng ảnh raster).
- Hoạt ảnh: nhún kiểu kẹo dẻo khi đang làm việc, nghỉ khi rảnh, phản ứng khi rê chuột và khi bấm.

### Tương tác và trạng thái

- **Khung câu hỏi** (hành động chính):
  - gửi tới `/api/chat/stream` hiện có, giữ `conversation_id` để vòng lặp chạy qua nhiều lượt;
  - mỗi frame `agent.step` đến thì viên kẹo chạy vào phòng đó và nhân vật nói `summary`;
  - trong lúc chờ LLM, kẹo đứng nhấp nháy ở phòng kế tiếp có thể đến.
- **Chip kịch bản** (chạy offline, cùng dạng dữ liệu `AgentStep[]`):
  - hỏi kiến thức;
  - ước lượng nguy cơ qua vòng lặp 2 lượt;
  - khẩn cấp;
  - chào hỏi / ngoài phạm vi;
  - hỏi liều insulin;
  - LLM sập (dự phòng);
  - không đủ bằng chứng.
- **Trạng thái từng phòng:** rảnh, đang chạy, đã chạy, bị bỏ qua (mờ), lỗi rồi dùng dự phòng (vân rạn + biểu tượng,
  không chỉ màu đỏ). Ray đã đi qua sáng lên; ray không đi mờ đi.
- **Bấm nhân vật hoặc máy** mở ngăn bên phải (dạng tờ tham chiếu nhân vật), gồm:
  - vai trò; code hay LLM; các tool;
  - cách dự phòng khi lỗi;
  - args/kết quả của lần chạy gần nhất (cắt ngắn);
  - link `vscode://file/<abs>:<line>` và GitHub `thanhtrnnn/diabeque` `#L<line>`.
- **Dải chú thích phía dưới:** kể bước hiện tại bằng tiếng Việt. Bảng "Vết chạy" ghi từng bước kèm thời gian.
- **`prefers-reduced-motion`:** không hoạt ảnh di chuyển; nút "Bước tiếp" để đi từng bước.
- **Không có WebGL:** hiện thông báo kèm link sang trang Kiến trúc cũ.
- **Điều hướng:** thêm mục "Nhà máy" vào thanh điều hướng của app. Trang Kiến trúc giữ nguyên.

### Code chạy đến (dòng code thật, không gõ tay)

Backend thêm vào mỗi step:
- `code: {path, line}` lấy bằng `inspect` từ hàm node thật, đường dẫn tương đối theo gốc repo;
- mỗi tool call thêm `code` tương tự;
- `fallback: string | null` khi node dùng đường dự phòng (ví dụ `"rules"`, `"passages"`).

Frontend parser chấp nhận các trường này là tùy chọn; giao diện chat hiện có không đổi. Kịch bản offline lưu sẵn
`code` sinh từ cùng nguồn (một lệnh xuất JSON từ backend) để không lệch số dòng.

### Hiệu năng

- three.js nạp động chỉ trên route này.
- Một scene; hình học dùng chung giữa các instance; bóng đổ chỉ từ một đèn.
- Mục tiêu 60 fps trên laptop demo (Apple Silicon); hạ chất lượng khi FPS thấp.

## B. Dự phòng thật khi LLM lỗi

| Node | Khi LLM lỗi (exception gọi endpoint) | Cờ |
|---|---|---|
| Tra cứu (`knowledge`) | trả các đoạn văn truy xuất được (top 3), mỗi đoạn kèm trích dẫn, mở đầu bằng câu báo "Không tạo được câu trả lời, đây là các đoạn tài liệu liên quan" | `fallback: "passages"` |
| Tư vấn (`advisor`) | trả các khuyến nghị lấy từ dữ kiện đồ thị (`facts` của hit) theo chủ đề nguy cơ, mỗi ý kèm trích dẫn đoạn gốc | `fallback: "graph_facts"` |
| Điều phối, Thu thập | giữ như cũ (luật), chỉ thêm cờ `fallback: "rules"` vào step | |

Yêu cầu:
- An toàn (ra) vẫn lọc các phần trên như mọi phần khác.
- Thêm test không cần LLM: giả lập client ném lỗi; kiểm tra có section, có trích dẫn, có cờ fallback.
- 31 test cũ phải vẫn qua.

## C. Tệp Cypher

- Tách mọi câu Cypher đang nằm trong Python ra thư mục `neo4j/cypher/`, mỗi giai đoạn một tệp, có chú thích tiếng Việt
  ngắn. Nguồn hiện có: `chap5-rag/backend/app/{db,retrieval,main}.py`,
  `chap5-rag/pipeline/{ingest_docs,extract_facts,survey_ingest}.py`, `chap6-agents/backend/app/{db,retrieval,main}.py`,
  `chap6-agents/backend/app/agents/{safety,nodes}.py`.
- Tệp dự kiến: `00_schema.cypher` (constraint, index, vector index), `10_ingest.cypher`, `20_facts.cypher`,
  `30_survey.cypher`, `40_retrieval.cypher`, `50_demo.cypher` (các truy vấn mở trong Neo4j Browser lúc demo).
- Một script (`make cypher`) gộp các tệp theo thứ tự thành một `neo4j/kb_diabet.cypher`.
- Mục đích: bản đọc và nộp kèm báo cáo (user chốt).

## Không làm

- Không đổi luồng LangGraph, prompt, mô hình, hay số liệu đánh giá.
- Không xóa trang Kiến trúc, không đổi giao diện chat hiện có.
- Không dùng hình ảnh, tên, nhân vật từ tác phẩm có bản quyền.

## Quyết định của Claude (sau vòng kiểm tra của người dựng; user xem lại)

- **Mô phỏng LLM sập khi chạy live:**
  - `ChatRequest` thêm trường tùy chọn `simulate: "llm_down" | null`. Backend chỉ nhận khi
    `ALLOW_SIMULATION=1` (mặc định bật trong `.env.example`, tắt trên máy chủ).
  - Khi bật, mọi lời gọi LLM ném lỗi ngay, để đường dự phòng thật chạy.
  - Nhà máy có công tắc "Cắt mây LLM" gửi cờ này.
- **Kịch bản offline được ghi từ lần chạy thật**, không viết tay:
  - script `chap6-agents/eval/record_scenarios.py` chạy graph với LLM + Neo4j thật (và cờ `llm_down` cho kịch bản sập);
  - lưu `AgentStep[]` kèm `code` vào `frontend/src/lib/factory-scenarios.json`;
  - lời thoại trong kịch bản là `summary` thật.
- **Tool hoặc Neo4j lỗi:**
  - không thêm dự phòng mới cho tool;
  - backend bọc mỗi node: khi exception, phát frame `agent.error {node, error_type}` trước `stream.error`;
  - nhà máy hiện đúng phòng hỏng (vân rạn + "lỗi tool, chưa có dự phòng"), không còn lỗi chung chung.
- **Link code:**
  - demo chạy local bằng `make up`;
  - `GET /api/v1/agents` trả thêm `repo_root` (đường dẫn tuyệt đối) và `commit` (`git rev-parse HEAD`, nếu có);
  - link VS Code dựng từ `repo_root`;
  - link GitHub ghim theo commit SHA, thiếu SHA thì dùng `main`. Repo `thanhtrnnn/diabeque` đang public.

## Phần để builder tự quyết

Hình khối chi tiết từng nhân vật; tọa độ isometric; thời lượng hoạt ảnh; cách tổ chức component React/three
(React Three Fiber hay three thuần); nội dung chú thích từng bước của kịch bản (lấy từ summary thật).

## Đã trả lời sau vòng kiểm tra

- **C:** gộp các câu truy vấn mà code đang dùng, để đọc và nộp kèm báo cáo (không phải script dựng lại dữ liệu).
  Các tệp `.cypher` là bản đọc, khớp với chuỗi Cypher trong Python. Một test kiểm tra từng truy vấn trong tệp vẫn
  xuất hiện nguyên văn trong code (sau khi chuẩn hóa khoảng trắng), để hai bên không lệch nhau.
- **Phạm vi:** phải xong cả A, B, C, không cắt phần nào. Thứ tự làm vẫn là B → A → C, đánh bóng nhân vật làm cuối
  phần A. Hạn project 17/11/2026.
