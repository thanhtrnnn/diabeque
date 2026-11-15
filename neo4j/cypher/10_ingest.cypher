// Giai đoạn 1: nạp tài liệu và đoạn văn vào Neo4j (chap5-rag/pipeline/ingest_docs.py).
// Tham số ($rows, $kb) do Python truyền; `$kb` luôn là "KB_diabet". Tệp này để đọc, không phải script dựng lại dữ liệu.

// name: disease_upsert
// source: chap5-rag/pipeline/ingest_docs.py::main
// Tạo 5 nút Disease (tên Việt, tên Anh) từ DISEASES trong schema.py.
UNWIND $rows AS r MERGE (d:Disease {id: r.id}) SET d += r.props, d.kb_id = $kb;

// name: document_upsert
// source: chap5-rag/pipeline/ingest_docs.py::main
// Tạo nút Document (35 tài liệu: tiêu đề, nhà xuất bản, url, ngôn ngữ) từ documents.jsonl.
UNWIND $rows AS r MERGE (d:Document {id: r.id}) SET d += r, d.kb_id = $kb;

// name: chunk_upsert
// source: chap5-rag/pipeline/ingest_docs.py::main
// Tạo nút Chunk kèm vector nhúng bge-m3 (1024 chiều), nối PART_OF về Document gốc.
UNWIND $rows AS r
MERGE (c:Chunk {id: r.id})
SET c += r.props, c.kb_id = $kb
WITH c, r
CALL db.create.setNodeVectorProperty(c, 'embedding', r.embedding)
WITH c, r
MATCH (d:Document {id: r.props.doc_id})
MERGE (c)-[:PART_OF]->(d);

// name: kb_counts_by_label
// source: chap5-rag/pipeline/ingest_docs.py::main
// Kiểm đếm sau khi nạp: số nút theo từng nhãn của đồ thị KB_diabet.
MATCH (n {kb_id: $kb}) RETURN labels(n)[0] AS label, count(*) AS n ORDER BY label;
