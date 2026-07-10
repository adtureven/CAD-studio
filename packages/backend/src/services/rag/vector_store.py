"""FAISS-backed vector store with JSON metadata sidecar.

Layout under ``settings.knowledge_dir``::

    docs/{doc_id}.pdf
    chunks/{doc_id}.jsonl
    manifest.json         # {doc_id: {filename, pages, chunks, uploaded_at}}
    index.faiss           # global IndexFlatIP
    index_ids.json        # parallel list of chunk_id strings

All chunks share one flat index for simplicity. That is fine up to ~10^5
chunks (~a few dozen books). Beyond that we can migrate to IVF/HNSW.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from pathlib import Path
from typing import Optional

import numpy as np

from ...config import settings

logger = logging.getLogger(__name__)


class VectorStore:
    def __init__(self, base_dir: Path, dim: int) -> None:
        self.base_dir = base_dir
        self.docs_dir = base_dir / "docs"
        self.chunks_dir = base_dir / "chunks"
        self.index_path = base_dir / "index.faiss"
        self.ids_path = base_dir / "index_ids.json"
        self.manifest_path = base_dir / "manifest.json"
        self.dim = dim
        self._lock = threading.RLock()

        for d in (self.base_dir, self.docs_dir, self.chunks_dir):
            d.mkdir(parents=True, exist_ok=True)

        self._index = None
        self._ids: list[str] = []
        self._manifest: dict[str, dict] = {}
        self._load()

    # ------------------------------------------------------------------
    # persistence
    # ------------------------------------------------------------------
    def _load(self) -> None:
        if self.manifest_path.exists():
            try:
                self._manifest = json.loads(self.manifest_path.read_text("utf-8"))
            except Exception as exc:
                logger.warning("manifest 读取失败，重置：%s", exc)
                self._manifest = {}
        if self.ids_path.exists():
            try:
                self._ids = json.loads(self.ids_path.read_text("utf-8"))
            except Exception:
                self._ids = []
        if self.index_path.exists():
            try:
                import faiss

                self._index = faiss.read_index(str(self.index_path))
                if self._index.d != self.dim:
                    logger.warning(
                        "FAISS 索引维度 %s 与配置 %s 不一致，重建。",
                        self._index.d, self.dim,
                    )
                    self._index = None
                    self._ids = []
            except Exception as exc:
                logger.warning("FAISS 索引读取失败：%s", exc)
                self._index = None
                self._ids = []

    def _ensure_index(self):
        if self._index is None:
            import faiss

            self._index = faiss.IndexFlatIP(self.dim)
        return self._index

    def _save(self) -> None:
        import faiss

        if self._index is not None:
            faiss.write_index(self._index, str(self.index_path))
        self.ids_path.write_text(json.dumps(self._ids, ensure_ascii=False))
        self.manifest_path.write_text(
            json.dumps(self._manifest, ensure_ascii=False, indent=2)
        )

    # ------------------------------------------------------------------
    # public API
    # ------------------------------------------------------------------
    def list_docs(self) -> list[dict]:
        with self._lock:
            return [
                {"doc_id": doc_id, **meta}
                for doc_id, meta in sorted(
                    self._manifest.items(),
                    key=lambda kv: kv[1].get("uploaded_at", 0),
                    reverse=True,
                )
            ]

    def has_doc(self, doc_id: str) -> bool:
        return doc_id in self._manifest

    def register_doc(self, doc_id: str, meta: dict) -> None:
        with self._lock:
            self._manifest[doc_id] = {
                "filename": meta.get("filename", ""),
                "pages": meta.get("pages", 0),
                "chunks": meta.get("chunks", 0),
                "uploaded_at": meta.get("uploaded_at") or int(time.time()),
                "size_bytes": meta.get("size_bytes", 0),
            }
            self._save()

    def add_vectors(
        self,
        doc_id: str,
        chunks: list[dict],
        vectors: list[list[float]],
    ) -> None:
        if not chunks:
            return
        if len(chunks) != len(vectors):
            raise ValueError("chunks 与 vectors 数量不一致")

        with self._lock:
            index = self._ensure_index()
            arr = np.asarray(vectors, dtype="float32")
            _l2_normalise(arr)
            index.add(arr)
            self._ids.extend(c["chunk_id"] for c in chunks)

            chunks_file = self.chunks_dir / f"{doc_id}.jsonl"
            with chunks_file.open("w", encoding="utf-8") as fp:
                for c in chunks:
                    fp.write(json.dumps(c, ensure_ascii=False) + "\n")
            self._save()

    def delete_doc(self, doc_id: str) -> bool:
        with self._lock:
            if doc_id not in self._manifest:
                return False

            keep_mask = [not cid.startswith(f"{doc_id}:") for cid in self._ids]
            self._ids = [cid for cid, keep in zip(self._ids, keep_mask) if keep]

            if self._index is not None:
                import faiss

                new_index = faiss.IndexFlatIP(self.dim)
                if self._ids:
                    all_vecs = _extract_vectors(self._index, keep_mask)
                    if all_vecs.size:
                        new_index.add(all_vecs)
                self._index = new_index

            self._manifest.pop(doc_id, None)
            chunks_file = self.chunks_dir / f"{doc_id}.jsonl"
            if chunks_file.exists():
                chunks_file.unlink()
            pdf_file = self.docs_dir / f"{doc_id}.pdf"
            if pdf_file.exists():
                pdf_file.unlink()
            self._save()
            return True

    def search(self, query_vector: list[float], top_k: int) -> list[tuple[str, float]]:
        with self._lock:
            if self._index is None or self._index.ntotal == 0:
                return []
            arr = np.asarray([query_vector], dtype="float32")
            _l2_normalise(arr)
            k = min(top_k, self._index.ntotal)
            scores, idx = self._index.search(arr, k)
            hits: list[tuple[str, float]] = []
            for score, i in zip(scores[0], idx[0]):
                if i < 0 or i >= len(self._ids):
                    continue
                hits.append((self._ids[i], float(score)))
            return hits

    def load_chunk(self, chunk_id: str) -> Optional[dict]:
        doc_id = chunk_id.split(":", 1)[0]
        chunks_file = self.chunks_dir / f"{doc_id}.jsonl"
        if not chunks_file.exists():
            return None
        with chunks_file.open("r", encoding="utf-8") as fp:
            for line in fp:
                if not line.strip():
                    continue
                data = json.loads(line)
                if data.get("chunk_id") == chunk_id:
                    return data
        return None


def _l2_normalise(arr: "np.ndarray") -> None:
    norms = np.linalg.norm(arr, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    arr /= norms


def _extract_vectors(index, keep_mask: list[bool]) -> "np.ndarray":
    # faiss.IndexFlat exposes the raw vectors via reconstruct / xb
    n = index.ntotal
    if n == 0:
        return np.zeros((0, index.d), dtype="float32")
    vectors = np.zeros((n, index.d), dtype="float32")
    for i in range(n):
        vectors[i] = index.reconstruct(i)
    return vectors[[i for i, k in enumerate(keep_mask) if k]]


_store: VectorStore | None = None


def get_vector_store(dim: int) -> VectorStore:
    global _store
    if _store is None or _store.dim != dim:
        _store = VectorStore(settings.knowledge_dir, dim)
    return _store
