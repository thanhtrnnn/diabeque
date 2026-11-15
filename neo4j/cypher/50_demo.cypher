// Truy vấn mở trong Neo4j Browser lúc demo (http://localhost:27474, neo4j / kb_diabet_a8); lấy từ DEMO.md, phần 1, bước 1.
// Chạy từng câu một; Browser hiển thị kết quả dạng đồ thị.

// name: demo_documents_chunks
// source: DEMO.md
// Đồ thị 60 đoạn văn nối về tài liệu gốc: KB gồm link và file PDF.
MATCH (d:Document)<-[:PART_OF]-(c:Chunk) RETURN d, c LIMIT 60;

// name: demo_symptom_support
// source: DEMO.md
// Dữ kiện triệu chứng của bệnh, mỗi dữ kiện trỏ về đoạn văn gốc làm bằng chứng.
MATCH p=(:Disease)-[:HAS_SYMPTOM]->(:Symptom)-[:SUPPORTED_BY]->(:Chunk) RETURN p LIMIT 25;
