from functools import lru_cache

from neo4j import Driver, GraphDatabase

from .config import settings
from .schema import EMBEDDING_DIM, VECTOR_INDEX, Label


@lru_cache
def driver() -> Driver:
    s = settings()
    return GraphDatabase.driver(s.neo4j_uri, auth=(s.neo4j_user, s.neo4j_password))


def ensure_schema() -> None:
    with driver().session() as session:
        for label in Label:
            key = "code" if label is Label.SURVEY_STATUS else "id"
            session.run(
                f"CREATE CONSTRAINT {label.lower()}_{key} IF NOT EXISTS "
                f"FOR (n:{label}) REQUIRE n.{key} IS UNIQUE"
            )
        session.run(
            f"CREATE VECTOR INDEX {VECTOR_INDEX} IF NOT EXISTS FOR (c:{Label.CHUNK}) ON c.embedding "
            "OPTIONS {indexConfig: {`vector.dimensions`: $dim, `vector.similarity_function`: 'cosine'}}",
            dim=EMBEDDING_DIM,
        )
