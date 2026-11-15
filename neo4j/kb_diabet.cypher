// kb_diabet.cypher: các truy vấn Cypher mà code Diabeque dùng, gộp thành một tệp để đọc và nộp kèm báo cáo.
// Tệp sinh tự động, sửa ở neo4j/cypher/ rồi chạy `make cypher`. Không phải script dựng lại dữ liệu.
// Ngày tạo: 2026-11-16
// Gồm các tệp: 00_schema.cypher, 10_ingest.cypher, 20_facts.cypher, 30_survey.cypher, 40_retrieval.cypher, 50_demo.cypher

// ============ 00_schema.cypher ============

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

// ============ 10_ingest.cypher ============

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

// ============ 20_facts.cypher ============

// Giai đoạn 2: nạp dữ kiện LLM trích từ đoạn văn (chap5-rag/pipeline/extract_facts.py). Mỗi dữ kiện đã qua kiểm câu trích:
// câu `quote` phải xuất hiện nguyên văn trong đoạn gốc. Hàm load() lặp qua 5 loại dữ kiện nên có 5 khối gần giống nhau.
// Tham số do Python truyền: $rows (mỗi hàng gồm fact và chunk_id), $kb.

// name: facts_symptom
// source: chap5-rag/pipeline/extract_facts.py::load
// Tạo nút Symptom (triệu chứng), nối HAS_SYMPTOM từ Disease và SUPPORTED_BY tới đoạn gốc kèm câu trích.
UNWIND $rows AS r
MERGE (f:Symptom {id: r.fact.id})
SET f.kb_id = $kb, f.key_vi = r.fact.key_vi,
    f.name_vi = coalesce(f.name_vi, r.fact.key_vi),
    f.condition = coalesce(f.condition, r.fact.condition)
WITH f, r
MATCH (d:Disease {id: r.fact.disease}), (c:Chunk {id: r.chunk_id})
MERGE (d)-[:HAS_SYMPTOM]->(f)
MERGE (f)-[sb:SUPPORTED_BY]->(c)
SET sb.quote = r.fact.quote;

// name: facts_complication
// source: chap5-rag/pipeline/extract_facts.py::load
// Tạo nút Complication (biến chứng), nối HAS_COMPLICATION từ Disease và SUPPORTED_BY tới đoạn gốc kèm câu trích.
UNWIND $rows AS r
MERGE (f:Complication {id: r.fact.id})
SET f.kb_id = $kb, f.key_vi = r.fact.key_vi,
    f.name_vi = coalesce(f.name_vi, r.fact.key_vi),
    f.condition = coalesce(f.condition, r.fact.condition)
WITH f, r
MATCH (d:Disease {id: r.fact.disease}), (c:Chunk {id: r.chunk_id})
MERGE (d)-[:HAS_COMPLICATION]->(f)
MERGE (f)-[sb:SUPPORTED_BY]->(c)
SET sb.quote = r.fact.quote;

// name: facts_risk_factor
// source: chap5-rag/pipeline/extract_facts.py::load
// Tạo nút RiskFactor (yếu tố nguy cơ), nối HAS_RISK_FACTOR từ Disease và SUPPORTED_BY tới đoạn gốc kèm câu trích.
UNWIND $rows AS r
MERGE (f:RiskFactor {id: r.fact.id})
SET f.kb_id = $kb, f.key_vi = r.fact.key_vi,
    f.name_vi = coalesce(f.name_vi, r.fact.key_vi),
    f.condition = coalesce(f.condition, r.fact.condition)
WITH f, r
MATCH (d:Disease {id: r.fact.disease}), (c:Chunk {id: r.chunk_id})
MERGE (d)-[:HAS_RISK_FACTOR]->(f)
MERGE (f)-[sb:SUPPORTED_BY]->(c)
SET sb.quote = r.fact.quote;

// name: facts_recommendation
// source: chap5-rag/pipeline/extract_facts.py::load
// Tạo nút Recommendation (khuyến nghị), nối HAS_RECOMMENDATION từ Disease và SUPPORTED_BY tới đoạn gốc kèm câu trích.
UNWIND $rows AS r
MERGE (f:Recommendation {id: r.fact.id})
SET f.kb_id = $kb, f.key_vi = r.fact.key_vi,
    f.text_vi = coalesce(f.text_vi, r.fact.text_vi),
    f.condition = coalesce(f.condition, r.fact.condition)
WITH f, r
MATCH (d:Disease {id: r.fact.disease}), (c:Chunk {id: r.chunk_id})
MERGE (d)-[:HAS_RECOMMENDATION]->(f)
MERGE (f)-[sb:SUPPORTED_BY]->(c)
SET sb.quote = r.fact.quote;

// name: facts_drug_class
// source: chap5-rag/pipeline/extract_facts.py::load
// Tạo nút DrugClass (nhóm thuốc), nối HAS_DRUG_CLASS từ Disease và SUPPORTED_BY tới đoạn gốc kèm câu trích.
UNWIND $rows AS r
MERGE (f:DrugClass {id: r.fact.id})
SET f.kb_id = $kb, f.key_vi = r.fact.key_vi,
    f.name_vi = coalesce(f.name_vi, r.fact.key_vi),
    f.condition = coalesce(f.condition, r.fact.condition)
WITH f, r
MATCH (d:Disease {id: r.fact.disease}), (c:Chunk {id: r.chunk_id})
MERGE (d)-[:HAS_DRUG_CLASS]->(f)
MERGE (f)-[sb:SUPPORTED_BY]->(c)
SET sb.quote = r.fact.quote;

// name: graph_node_counts
// source: chap5-rag/pipeline/extract_facts.py::graph_stats
// Thống kê đồ thị sau khi trích: số nút theo nhãn.
MATCH (n {kb_id: $kb}) RETURN labels(n)[0] AS k, count(*) AS n ORDER BY k;

// name: graph_rel_counts
// source: chap5-rag/pipeline/extract_facts.py::graph_stats
// Thống kê đồ thị sau khi trích: số cạnh theo loại quan hệ.
MATCH (a {kb_id: $kb})-[r]->(b {kb_id: $kb}) RETURN type(r) AS k, count(*) AS n ORDER BY k;

// name: facts_bilingual
// source: chap5-rag/pipeline/extract_facts.py::graph_stats
// Số dữ kiện có nguồn, và số dữ kiện được đoạn tiếng Việt lẫn tiếng Anh cùng chống đỡ.
MATCH (f)-[:SUPPORTED_BY]->(c:Chunk) WITH f, collect(DISTINCT c.lang) AS langs RETURN count(*) AS facts, sum(CASE WHEN size(langs) > 1 THEN 1 ELSE 0 END) AS bilingual;

// ============ 30_survey.cypher ============

// Giai đoạn 3: nạp mẫu khảo sát BRFSS (600 bản ghi, 100 mỗi cặp năm x nhóm) (chap5-rag/pipeline/survey_ingest.py).
// Tham số ($statuses, $rows, $kb_id, $kb) do Python truyền; `$kb_id` và `$kb` đều là "KB_diabet".

// name: survey_status_merge
// source: chap5-rag/pipeline/survey_ingest.py::MERGE_STATUSES
// Tạo ba nút SurveyStatus (không báo cáo mắc bệnh, tiền đái tháo đường, báo cáo mắc đái tháo đường).
UNWIND $statuses AS s
MERGE (st:SurveyStatus {code: s.code})
SET st.label_vi = s.label_vi, st.kb_id = $kb_id;

// name: survey_records_merge
// source: chap5-rag/pipeline/survey_ingest.py::MERGE_RECORDS
// Tạo nút SurveyRecord (năm, nhóm, đặc trưng JSON) và nối HAS_REPORTED_STATUS tới SurveyStatus.
UNWIND $rows AS r
MATCH (st:SurveyStatus {code: r.status_code})
MERGE (rec:SurveyRecord {id: r.id})
SET rec.kb_id = $kb_id, rec.year = r.year, rec.status = r.status, rec.features_json = r.features_json
MERGE (rec)-[:HAS_REPORTED_STATUS]->(st);

// name: survey_counts
// source: chap5-rag/pipeline/survey_ingest.py::ingest
// Kiểm đếm sau khi nạp: số bản ghi, số cạnh, số nút trạng thái (kỳ vọng 600, 600, 3).
MATCH (r:SurveyRecord {kb_id: $kb}) OPTIONAL MATCH (r)-[e:HAS_REPORTED_STATUS]->(s) RETURN count(DISTINCT r) AS records, count(e) AS edges, count(DISTINCT s) AS statuses;

// ============ 40_retrieval.cypher ============

// Giai đoạn 4: truy xuất lúc chạy (Chương 5 và Chương 6 dùng chung một bản mã, nên mỗi khối có hai nguồn).
// Tham số do Python truyền: $kb, $index, $k, $v (vector truy vấn), $seeds, $disease, $ids, $id, $limit.

// name: corpus_chunks
// source: chap5-rag/backend/app/retrieval.py::corpus
// source: chap6-agents/backend/app/retrieval.py::corpus
// Đọc toàn bộ đoạn văn kèm tiêu đề, nhà xuất bản, url để dựng chỉ mục BM25 trong bộ nhớ.
MATCH (c:Chunk {kb_id: $kb})-[:PART_OF]->(d:Document) RETURN c.id AS id, c.doc_id AS doc_id, c.text AS text, c.lang AS lang, d.title AS title, d.publisher AS publisher, d.url AS url ORDER BY c.id;

// name: vector_search
// source: chap5-rag/backend/app/retrieval.py::vector_search
// source: chap6-agents/backend/app/retrieval.py::vector_search
// Tìm $k đoạn gần nhất theo cosine trong chỉ mục vector chunk_embedding.
CALL db.index.vector.queryNodes($index, $k, $v) YIELD node, score RETURN node.id AS id, score;

// name: graph_expansion
// source: chap5-rag/backend/app/retrieval.py::graph_search
// source: chap6-agents/backend/app/retrieval.py::graph_search
// Mở rộng qua đồ thị: đoạn cùng chống đỡ một dữ kiện với đoạn hạt giống, cộng đoạn sau dữ kiện của bệnh theo chủ đề.
CALL {
  MATCH (seed:Chunk)<-[:SUPPORTED_BY]-(f)-[:SUPPORTED_BY]->(c:Chunk)
  WHERE seed.id IN $seeds AND NOT c.id IN $seeds
  RETURN c.id AS id, count(DISTINCT f) AS w
  UNION ALL
  MATCH (:Disease {id: $disease})-->(f)-[:SUPPORTED_BY]->(c:Chunk)
  RETURN c.id AS id, count(DISTINCT f) AS w
}
RETURN id, sum(w) AS weight ORDER BY weight DESC, id LIMIT $k;

// name: facts_for_chunks
// source: chap5-rag/backend/app/retrieval.py::facts_for
// source: chap6-agents/backend/app/retrieval.py::facts_for
// Với mỗi đoạn, lấy các dữ kiện đồ thị trỏ tới nó (loại, tên, điều kiện, bệnh) để làm khuyến nghị có trích dẫn.
MATCH (d:Disease)-->(f)-[:SUPPORTED_BY]->(c:Chunk) WHERE c.id IN $ids RETURN c.id AS id, collect(DISTINCT labels(f)[0] + ': ' + coalesce(f.name_vi, f.text_vi) + coalesce(' (điều kiện: ' + f.condition + ')', '') + ' [' + d.name_vi + ']') AS facts;

// name: graph_node_center
// source: chap5-rag/backend/app/main.py::graph
// source: chap6-agents/backend/app/main.py::graph
// Trang Đồ thị: lấy nút trung tâm và nhãn của nó theo id.
MATCH (n {kb_id: $kb, id: $id}) RETURN n, labels(n)[0] AS label;

// name: graph_node_neighbors
// source: chap5-rag/backend/app/main.py::graph
// source: chap6-agents/backend/app/main.py::graph
// Trang Đồ thị: láng giềng của nút, tối đa $limit nút mỗi loại quan hệ để loại nào cũng hiện.
MATCH (n {kb_id: $kb, id: $id})-[r]-(m) WITH type(r) AS rel, startNode(r) = n AS out, m ORDER BY m.id WITH rel, collect({out: out, m: m, label: labels(m)[0]})[..$limit] AS xs UNWIND xs AS x RETURN rel, x.out AS out, x.m AS m, x.label AS label;

// ============ 50_demo.cypher ============

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
