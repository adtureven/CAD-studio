"""Embedding client. Uses an OpenAI-compatible endpoint when configured,
otherwise falls back to a deterministic hash-based bag-of-words vector so
the pipeline still works offline (retrieval quality is degraded).
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import math

import httpx
import openai

from ...config import settings

logger = logging.getLogger(__name__)

_BATCH_SIZE = 32
_FALLBACK_DIM = 512


class Embedder:
    def __init__(self) -> None:
        self._client: openai.AsyncOpenAI | None = None
        if settings.embedding_base_url and settings.embedding_api_key:
            self._client = openai.AsyncOpenAI(
                base_url=settings.embedding_base_url,
                api_key=settings.embedding_api_key,
                timeout=httpx.Timeout(60.0, connect=10.0),
            )
        self._model = settings.embedding_model
        self._remote_dim = settings.embedding_dim

    @property
    def dim(self) -> int:
        return self._remote_dim if self._client else _FALLBACK_DIM

    @property
    def uses_remote(self) -> bool:
        return self._client is not None

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        if self._client is None:
            return [_hash_embed(t, _FALLBACK_DIM) for t in texts]

        vectors: list[list[float]] = []
        for i in range(0, len(texts), _BATCH_SIZE):
            batch = texts[i : i + _BATCH_SIZE]
            try:
                resp = await self._client.embeddings.create(
                    model=self._model,
                    input=batch,
                )
            except Exception as exc:
                logger.warning("远程 embedding 失败，降级本地：%s", exc)
                for t in batch:
                    vectors.append(_hash_embed(t, _FALLBACK_DIM))
                self._client = None  # avoid hammering broken endpoint
                self._remote_dim = _FALLBACK_DIM
                continue
            for item in resp.data:
                vectors.append(list(item.embedding))
            await asyncio.sleep(0)
        return vectors

    async def embed_one(self, text: str) -> list[float]:
        result = await self.embed([text])
        return result[0] if result else []


def _hash_embed(text: str, dim: int) -> list[float]:
    """Deterministic bag-of-words hashing embedding for offline fallback.

    Not great, but keeps unit tests and demos working without an embedding
    endpoint. Real deployments should configure EMBEDDING_BASE_URL/KEY.
    """
    vec = [0.0] * dim
    tokens = _tokenise(text)
    if not tokens:
        return vec
    for token in tokens:
        h = int(hashlib.md5(token.encode("utf-8")).hexdigest(), 16)
        idx = h % dim
        sign = 1.0 if (h >> 32) & 1 else -1.0
        vec[idx] += sign
    # L2 normalise so cosine similarity == dot product.
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def _tokenise(text: str) -> list[str]:
    text = text.lower()
    out: list[str] = []
    buf: list[str] = []
    for ch in text:
        if ch.isalnum():
            buf.append(ch)
        else:
            if buf:
                out.append("".join(buf))
                buf.clear()
            # Emit CJK bigrams so Chinese still gets some signal.
            if "\u4e00" <= ch <= "\u9fff":
                out.append(ch)
    if buf:
        out.append("".join(buf))
    # Bigrams for CJK
    bigrams: list[str] = []
    for a, b in zip(out, out[1:]):
        if len(a) == 1 and "\u4e00" <= a <= "\u9fff" and len(b) == 1 and "\u4e00" <= b <= "\u9fff":
            bigrams.append(a + b)
    return out + bigrams
