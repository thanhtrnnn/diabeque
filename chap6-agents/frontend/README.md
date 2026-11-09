# Diabeque (frontend)

Trợ lý đa agent sàng lọc và tư vấn đái tháo đường. Giao diện Next.js 16 cho hệ đa agent: kiểm an
toàn, điều phối, thu thập thông tin, dự đoán nguy cơ, tra cứu tri thức trên đồ
thị Neo4j `KB_diabet` và tư vấn có trích dẫn.

| Route | Nội dung |
|---|---|
| `/app/chat` | Hỏi đáp và đánh giá nguy cơ, luồng SSE, bảng quá trình các agent, thẻ hồ sơ và nguy cơ |
| `/app/kien-truc` | Danh sách agent, sơ đồ giám sát, văn bản Mermaid từ backend |
| `/app/do-thi` | Đồ thị tri thức |
| `/app/phan-loai` | Phân loại khảo sát |

`/` và `/app` chuyển hướng tới `/app/chat`. Không có đăng nhập.

## Chạy

```bash
npm ci
cp env.local.example .env.local   # API_BASE_URL mặc định http://localhost:8200/api/v1
npm run dev -- --port 3200
```

Backend FastAPI phải chạy ở cổng 8200.

## Kiểm tra

```bash
npm run typecheck && npm run lint && npm test
```

Các test hợp đồng đọc mã nguồn backend ở `../backend/app` (sự kiện SSE, trạng thái
câu trả lời, loại section, id agent, các nhánh của đồ thị) và tự bỏ qua nếu thư mục
đó không có.

## Hợp đồng chat

`POST /api/chat/stream` nhận `{message, conversation_id}` và chuyển tiếp luồng SSE
của backend. Mọi lượt của một hội thoại phải gửi cùng `conversation_id`, vì backend
giữ hồ sơ sức khỏe đã thu thập theo id đó.

Sự kiện: `stream.started`, `agent.step` (mỗi agent xong là một sự kiện, trước
`sources.snapshot`), `sources.snapshot`, `answer.started`, `answer.section.*`,
`answer.text.delta`, `answer.citation`, `answer.final`, `stream.completed`,
`stream.error`.

Trạng thái câu trả lời: `answered`, `needs_info`, `emergency`,
`insufficient_evidence`, `out_of_scope`. Loại section: `conclusion`, `risk`,
`advice`, `question`, `emergency`, `notice`, `basis`; id có dạng `{kind}-{order}`.
`answer.final.answer.agent` mang `intent`, `trace`, `profile`, `missing`, `risk`,
`safety_flags`. `confidence` luôn bằng 0 và không được hiển thị.
