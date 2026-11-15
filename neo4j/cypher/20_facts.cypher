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
