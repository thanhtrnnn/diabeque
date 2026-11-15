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
