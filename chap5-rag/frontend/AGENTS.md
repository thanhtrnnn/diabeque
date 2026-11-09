<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Bố cục

Mọi con trực tiếp của `grid` hoặc `flex` phải đặt rõ `width: 100%`,
`min-width: 0` và `box-sizing: border-box`, trừ cột icon hoặc control có kích
thước cố định. Không dựa vào kích thước nội tại cho canvas chính hoặc khối chữ.

### Bất biến full-width

- App shell, workbench và canvas chính lấp đầy vùng chứa: `width: 100%`,
  `max-width: none`, `min-width: 0` xuyên suốt chuỗi grid/flex từ shell đến
  canvas. Không đặt giới hạn đọc như `56rem`, `72rem` hay `96rem` lên các vùng
  bố cục này.
- Chỉ nội dung đọc bên trong (prose, thân tin nhắn) mới được đặt `max-width`.
  Rail điều hướng là track tường minh; canvas luôn dùng `minmax(0, 1fr)`.
- Kiểm cả underfill tại 1920, 1440, 1024 và 375px: `scrollWidth === clientWidth`,
  frame rộng bằng content box của parent (sai số tối đa 1px), và rail + canvas
  rộng bằng app body (sai số tối đa 1px).

## Giao diện

- `tokens.css` là nguồn token duy nhất. CSS thành phần không tự đặt màu, font,
  bo góc, khoảng cách hay thời lượng chuyển động.
- Chữ dùng các bậc 12/14/16/20/28/40px; khoảng cách 4/8/12/16/24/32/48/64px.
- `StatePanel` cho trạng thái tải, không tìm thấy và lỗi của route.
- Chuyển động chỉ để phản hồi (120ms tương tác, 220ms mở rộng, 320ms panel),
  giữ `prefers-reduced-motion` và `forced-colors`.

## Dữ liệu

- Hợp đồng SSE nằm ở `src/lib/chat-stream-contract.ts`; danh sách sự kiện phải
  bằng `SSE_EVENTS` trong `backend/app/schema.py` (có test so khớp).
- BFF (`src/app/api/**`) chuyển tiếp tới `API_BASE_URL`, không có xác thực.
- Hội thoại lưu ở `localStorage` (`src/lib/conversation-store.ts`), mọi truy cập
  bọc `try/catch`.
