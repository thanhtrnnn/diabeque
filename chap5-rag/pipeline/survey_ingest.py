"""MERGE a fixed sample of status3 survey records into Neo4j: 100 per (year, status), in record_id order."""

import sqlite3

from backend.app.db import driver
from backend.app.schema import KB_ID, LABEL_NAMES, Label, Rel, Task
from pipeline.survey_sqlite import DB_PATH

PER_GROUP = 100

SAMPLE_SQL = """
SELECT record_id, year, status, features_json FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY year, status ORDER BY record_id) AS rn
  FROM survey_records WHERE task = ?
) WHERE rn <= ? ORDER BY record_id
"""

MERGE_STATUSES = f"""
UNWIND $statuses AS s
MERGE (st:{Label.SURVEY_STATUS} {{code: s.code}})
SET st.label_vi = s.label_vi, st.kb_id = $kb_id
"""

MERGE_RECORDS = f"""
UNWIND $rows AS r
MATCH (st:{Label.SURVEY_STATUS} {{code: r.status_code}})
MERGE (rec:{Label.SURVEY_RECORD} {{id: r.id}})
SET rec.kb_id = $kb_id, rec.year = r.year, rec.status = r.status, rec.features_json = r.features_json
MERGE (rec)-[:{Rel.HAS_REPORTED_STATUS}]->(st)
"""


def status_code(task: Task, status: int) -> str:
    return f"{task.value}:{status}"


def ingest() -> dict[str, int]:
    with sqlite3.connect(DB_PATH) as con:
        sample = con.execute(SAMPLE_SQL, (Task.STATUS3.value, PER_GROUP)).fetchall()
    statuses = [
        {"code": status_code(task, code), "label_vi": name} for (task, code), name in LABEL_NAMES.items() if task is Task.STATUS3
    ]
    rows = [
        {"id": rid, "year": year, "status": status, "status_code": status_code(Task.STATUS3, status), "features_json": js}
        for rid, year, status, js in sample
    ]

    def write(tx):
        tx.run(MERGE_STATUSES, statuses=statuses, kb_id=KB_ID)
        tx.run(MERGE_RECORDS, rows=rows, kb_id=KB_ID)

    with driver().session() as session:
        session.execute_write(write)
        counts = session.run(
            f"MATCH (r:{Label.SURVEY_RECORD} {{kb_id: $kb}}) OPTIONAL MATCH (r)-[e:{Rel.HAS_REPORTED_STATUS}]->(s) "
            f"RETURN count(DISTINCT r) AS records, count(e) AS edges, count(DISTINCT s) AS statuses",
            kb=KB_ID,
        ).single()
    return dict(counts)


if __name__ == "__main__":
    print(ingest())
