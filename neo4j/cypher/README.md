# Truy vấn Cypher của Diabeque

Các tệp này gom mọi câu Cypher mà code đang dùng, để đọc và nộp kèm báo cáo tiểu luận. Chúng **không phải script dựng lại dữ liệu**:
tham số (`$rows`, `$kb`, `$ids`, ...) do Python truyền lúc chạy. Dữ liệu dựng bằng `make kb-restore` (từ `neo4j/neo4j.dump`)
hoặc `make kb`.

| Tệp | Giai đoạn | Nguồn trong code |
|---|---|---|
| `00_schema.cypher` | ràng buộc duy nhất, chỉ mục vector | `backend/app/db.py::ensure_schema` (cả hai chương) |
| `10_ingest.cypher` | nạp Disease, Document, Chunk + vector | `chap5-rag/pipeline/ingest_docs.py` |
| `20_facts.cypher` | nạp dữ kiện trích bằng LLM, thống kê đồ thị | `chap5-rag/pipeline/extract_facts.py` |
| `30_survey.cypher` | nạp 600 bản ghi khảo sát BRFSS | `chap5-rag/pipeline/survey_ingest.py` |
| `40_retrieval.cypher` | truy xuất lúc chạy (BM25 corpus, vector, mở rộng đồ thị, trang Đồ thị) | `backend/app/{retrieval,main}.py` (cả hai chương) |
| `50_demo.cypher` | truy vấn mở trong Neo4j Browser lúc demo | `DEMO.md` |

`../kb_diabet.cypher` là bản gộp của sáu tệp trên (sinh tự động bằng `make cypher`, đừng sửa tay).

## Quy ước khối

```
// name: <snake_case>
// source: <đường dẫn repo>::<hàm hoặc hằng>      (lặp lại nếu nhiều nơi dùng cùng câu)
// Một dòng chú thích tiếng Việt.
<câu Cypher>;
```

Khối có nguồn `.py` phải trùng nguyên văn, sau khi chuẩn hóa khoảng trắng, với chuỗi trong hàm hoặc hằng đó. Với f-string, các chỗ
`{Label.X}`, `{Rel.X}`, `{KB_ID}`, `{VECTOR_INDEX}` được thay bằng giá trị trong `chap5-rag/backend/app/schema.py`; vòng lặp trong
`ensure_schema()` và `extract_facts.load()` được khai triển thành từng khối riêng (10 ràng buộc, 5 loại dữ kiện).
Khối nguồn `DEMO.md` phải có mặt trong tệp đó.

## Kiểm tra

```bash
make cypher                                    # ghi lại neo4j/kb_diabet.cypher
.venv/bin/python scripts/combine_cypher.py --check
.venv/bin/python -m pytest tests -q            # test lệch giữa .cypher và code (make test cũng chạy)
```

Test lệch sẽ báo khối nào không còn khớp code. Khi đổi chuỗi Cypher trong Python thì sửa khối tương ứng ở đây, rồi `make cypher`.

## Chạy thử

Neo4j Browser: `http://localhost:27474` (neo4j / `kb_diabet_a8`), dán từng câu trong `50_demo.cypher`. Hoặc:

```bash
docker exec -i diabeque-neo4j-1 cypher-shell -u neo4j -p kb_diabet_a8 < neo4j/cypher/50_demo.cypher
```

Các câu ở `10`–`30` ghi dữ liệu (MERGE, CREATE): không chạy chúng vào KB đã nạp nếu không có ý định ghi đè.
