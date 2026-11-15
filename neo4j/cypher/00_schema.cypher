// Giai đoạn 0: ràng buộc duy nhất và chỉ mục vector (ensure_schema(), chạy mỗi lần khởi động API và trước khi nạp).
// Chương 5 và Chương 6 dùng chung một đoạn mã nên mỗi khối có hai nguồn. `IF NOT EXISTS` nên chạy lại không lỗi.

// name: constraint_document
// source: chap5-rag/backend/app/db.py::ensure_schema
// source: chap6-agents/backend/app/db.py::ensure_schema
// Ràng buộc duy nhất cho nút Document: tài liệu nguồn.
CREATE CONSTRAINT document_id IF NOT EXISTS FOR (n:Document) REQUIRE n.id IS UNIQUE;

// name: constraint_chunk
// source: chap5-rag/backend/app/db.py::ensure_schema
// source: chap6-agents/backend/app/db.py::ensure_schema
// Ràng buộc duy nhất cho nút Chunk: đoạn văn.
CREATE CONSTRAINT chunk_id IF NOT EXISTS FOR (n:Chunk) REQUIRE n.id IS UNIQUE;

// name: constraint_disease
// source: chap5-rag/backend/app/db.py::ensure_schema
// source: chap6-agents/backend/app/db.py::ensure_schema
// Ràng buộc duy nhất cho nút Disease: bệnh.
CREATE CONSTRAINT disease_id IF NOT EXISTS FOR (n:Disease) REQUIRE n.id IS UNIQUE;

// name: constraint_symptom
// source: chap5-rag/backend/app/db.py::ensure_schema
// source: chap6-agents/backend/app/db.py::ensure_schema
// Ràng buộc duy nhất cho nút Symptom: triệu chứng.
CREATE CONSTRAINT symptom_id IF NOT EXISTS FOR (n:Symptom) REQUIRE n.id IS UNIQUE;

// name: constraint_complication
// source: chap5-rag/backend/app/db.py::ensure_schema
// source: chap6-agents/backend/app/db.py::ensure_schema
// Ràng buộc duy nhất cho nút Complication: biến chứng.
CREATE CONSTRAINT complication_id IF NOT EXISTS FOR (n:Complication) REQUIRE n.id IS UNIQUE;

// name: constraint_riskfactor
// source: chap5-rag/backend/app/db.py::ensure_schema
// source: chap6-agents/backend/app/db.py::ensure_schema
// Ràng buộc duy nhất cho nút RiskFactor: yếu tố nguy cơ.
CREATE CONSTRAINT riskfactor_id IF NOT EXISTS FOR (n:RiskFactor) REQUIRE n.id IS UNIQUE;

// name: constraint_recommendation
// source: chap5-rag/backend/app/db.py::ensure_schema
// source: chap6-agents/backend/app/db.py::ensure_schema
// Ràng buộc duy nhất cho nút Recommendation: khuyến nghị.
CREATE CONSTRAINT recommendation_id IF NOT EXISTS FOR (n:Recommendation) REQUIRE n.id IS UNIQUE;

// name: constraint_drugclass
// source: chap5-rag/backend/app/db.py::ensure_schema
// source: chap6-agents/backend/app/db.py::ensure_schema
// Ràng buộc duy nhất cho nút DrugClass: nhóm thuốc.
CREATE CONSTRAINT drugclass_id IF NOT EXISTS FOR (n:DrugClass) REQUIRE n.id IS UNIQUE;

// name: constraint_surveyrecord
// source: chap5-rag/backend/app/db.py::ensure_schema
// source: chap6-agents/backend/app/db.py::ensure_schema
// Ràng buộc duy nhất cho nút SurveyRecord: bản ghi khảo sát.
CREATE CONSTRAINT surveyrecord_id IF NOT EXISTS FOR (n:SurveyRecord) REQUIRE n.id IS UNIQUE;

// name: constraint_surveystatus
// source: chap5-rag/backend/app/db.py::ensure_schema
// source: chap6-agents/backend/app/db.py::ensure_schema
// Ràng buộc duy nhất cho nút SurveyStatus: trạng thái khảo sát (khóa là `code`).
CREATE CONSTRAINT surveystatus_code IF NOT EXISTS FOR (n:SurveyStatus) REQUIRE n.code IS UNIQUE;

// name: vector_index_chunk
// source: chap5-rag/backend/app/db.py::ensure_schema
// source: chap6-agents/backend/app/db.py::ensure_schema
// Chỉ mục vector cosine cho Chunk.embedding; $dim = 1024 (bge-m3), chạy tay thì thay `$dim` bằng 1024 hoặc `:param dim => 1024`.
CREATE VECTOR INDEX chunk_embedding IF NOT EXISTS FOR (c:Chunk) ON c.embedding OPTIONS {indexConfig: {`vector.dimensions`: $dim, `vector.similarity_function`: 'cosine'}};
