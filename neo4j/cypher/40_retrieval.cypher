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
