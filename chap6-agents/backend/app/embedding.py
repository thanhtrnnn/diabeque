from functools import lru_cache

import torch
from sentence_transformers import SentenceTransformer

from .config import settings


@lru_cache
def model() -> SentenceTransformer:
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    return SentenceTransformer(settings().embedding_model, device=device)


def embed(texts: list[str], batch_size: int = 16) -> list[list[float]]:
    vectors = model().encode(texts, batch_size=batch_size, normalize_embeddings=True, show_progress_bar=len(texts) > 64)
    return vectors.tolist()
