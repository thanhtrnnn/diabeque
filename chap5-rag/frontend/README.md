# Tra cứu Đái tháo đường (frontend)

Giao diện Next.js 16 cho hệ thống hỏi đáp RAG trên đồ thị Neo4j `KB_diabet`.

| Route | Nội dung |
|---|---|
| `/app/chat` | Hỏi đáp có trích dẫn, luồng SSE, lịch sử lưu trên trình duyệt |
| `/app/do-thi` | Đồ thị tri thức |
| `/app/phan-loai` | Phân loại khảo sát |

`/` và `/app` chuyển hướng tới `/app/chat`. Không có đăng nhập.

## Chạy

```bash
npm ci
cp env.local.example .env.local   # API_BASE_URL mặc định http://localhost:8100/api/v1
npm run dev -- --port 3100
```

Backend FastAPI phải chạy ở cổng 8100 (`make api` ở thư mục gốc).

## Kiểm tra

```bash
npm run lint && npx tsc --noEmit && npm test && npm run build
```

## Hợp đồng chat

`POST /api/chat/stream` nhận `{message, conversation_id, topic?}` và chuyển tiếp
luồng SSE của backend. Mỗi nguồn (`SourceRecord`) gồm `source_id`, `citation_id`,
`chunk_id`, `document_id`, `document_title`, `publisher`, `lang`, `excerpt`,
`source_url`, `retrieval_rank`, `normalized_score`, `retrieved_by`, `role`.
Trạng thái câu trả lời: `answered`, `insufficient_evidence`, `out_of_scope`;
lời miễn trừ hiển thị dưới mọi câu trả lời.
