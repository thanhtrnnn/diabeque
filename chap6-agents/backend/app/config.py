from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    # .env ở gốc repo dùng chung cho hai ứng dụng; .env trong thư mục ứng dụng (nếu có) ghi đè.
    model_config = SettingsConfigDict(env_file=(ROOT.parent / ".env", ROOT / ".env"), extra="ignore")

    openai_base_url: str
    openai_api_key: str
    model_name: str
    neo4j_uri: str = "bolt://localhost:27687"
    neo4j_user: str = "neo4j"
    neo4j_password: str
    embedding_model: str = "BAAI/bge-m3"

    @property
    def llm_base_url(self) -> str:
        return self.openai_base_url.removesuffix("/").removesuffix("/chat/completions")


@lru_cache
def settings() -> Settings:
    return Settings()
