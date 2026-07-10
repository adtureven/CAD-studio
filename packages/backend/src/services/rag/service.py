"""High-level knowledge base API used by the HTTP layer and the Agent tool."""

from __future__ import annotations

import asyncio
import logging
import re
import time
import uuid
from pathlib import Path

from ...config import settings
from .chunker import chunk_pages, extract_pages
from .embedder import Embedder
from .vector_store import get_vector_store

logger = logging.getLogger(__name__)


class KnowledgeService:
    def __init__(self) -> None:
        self._embedder = Embedder()
        self._store = get_vector_store(self._embedder.dim)

    # ------------------------------------------------------------------
    # documents
    # ------------------------------------------------------------------
    def list_docs(self) -> list[dict]:
        return self._store.list_docs()

    def delete_doc(self, doc_id: str) -> bool:
        return self._store.delete_doc(doc_id)

    async def add_pdf(self, filename: str, data: bytes) -> dict:
        doc_id = _make_doc_id(filename)
        pdf_path = self._store.docs_dir / f"{doc_id}.pdf"
        pdf_path.write_bytes(data)
        return await self._ingest(doc_id, filename, pdf_path, len(data))

    async def add_pdf_from_path(
        self, filename: str, source_path: Path, size_bytes: int
    ) -> dict:
        """Ingest a PDF that has already been streamed to a temp file on disk."""
        doc_id = _make_doc_id(filename)
        pdf_path = self._store.docs_dir / f"{doc_id}.pdf"
        # Move (or copy across filesystems) to the KB directory.
        try:
            source_path.replace(pdf_path)
        except OSError:
            import shutil

            shutil.copyfile(source_path, pdf_path)
        return await self._ingest(doc_id, filename, pdf_path, size_bytes)

    async def _ingest(
        self, doc_id: str, filename: str, pdf_path: Path, size_bytes: int
    ) -> dict:
        try:
            pages = await asyncio.to_thread(extract_pages, pdf_path)
        except Exception as exc:
            pdf_path.unlink(missing_ok=True)
            raise RuntimeError(f"PDF 解析失败：{exc}") from exc

        chunks = chunk_pages(
            pages,
            doc_id=doc_id,
            chunk_size=settings.knowledge_chunk_size,
            overlap=settings.knowledge_chunk_overlap,
        )
        if not chunks:
            pdf_path.unlink(missing_ok=True)
            raise RuntimeError("PDF 未提取到可用文本（可能是扫描件，需 OCR）。")

        texts = [c.text for c in chunks]
        vectors = await self._embedder.embed(texts)
        if len(vectors) != len(chunks):
            raise RuntimeError("embedding 数量与 chunk 数不匹配")

        payloads = [c.to_dict() for c in chunks]
        self._store.add_vectors(doc_id, payloads, vectors)

        meta = {
            "filename": filename,
            "pages": len(pages),
            "chunks": len(chunks),
            "size_bytes": size_bytes,
            "uploaded_at": int(time.time()),
        }
        self._store.register_doc(doc_id, meta)
        return {"doc_id": doc_id, **meta}

    # ------------------------------------------------------------------
    # retrieval
    # ------------------------------------------------------------------
    async def search(self, query: str, top_k: int = 5) -> list[dict]:
        query = query.strip()
        if not query:
            return []
        vec = await self._embedder.embed_one(query)
        if not vec:
            return []
        hits = self._store.search(vec, top_k=top_k)
        results: list[dict] = []
        for chunk_id, score in hits:
            data = self._store.load_chunk(chunk_id)
            if not data:
                continue
            doc_meta = next(
                (d for d in self._store.list_docs() if d["doc_id"] == data["doc_id"]),
                {},
            )
            results.append({
                "chunk_id": chunk_id,
                "score": round(score, 4),
                "doc_id": data["doc_id"],
                "filename": doc_meta.get("filename", ""),
                "page": data.get("page", 0),
                "heading": data.get("heading", ""),
                "text": data["text"],
            })
        return results

    async def search_as_context(
        self, query: str, top_k: int = 3, max_chars: int = 1200
    ) -> tuple[str, list[dict]]:
        """Return (formatted context, raw hits) for prompt injection."""
        hits = await self.search(query, top_k=top_k)
        if not hits:
            return "", []
        blocks: list[str] = []
        used = 0
        for i, hit in enumerate(hits, 1):
            header = f"[{i}] {hit['filename']} · 第 {hit['page']} 页"
            if hit.get("heading"):
                header += f" · {hit['heading']}"
            body = hit["text"].strip()
            piece = f"{header}\n{body}"
            if used + len(piece) > max_chars and blocks:
                break
            blocks.append(piece)
            used += len(piece)
        return "\n\n".join(blocks), hits


def _make_doc_id(filename: str) -> str:
    stem = Path(filename).stem or "doc"
    slug = re.sub(r"[^A-Za-z0-9\u4e00-\u9fff]+", "-", stem).strip("-").lower()
    if not slug:
        slug = "doc"
    return f"{slug[:32]}-{uuid.uuid4().hex[:6]}"


_service: KnowledgeService | None = None


def get_knowledge_service() -> KnowledgeService:
    global _service
    if _service is None:
        _service = KnowledgeService()
    return _service
