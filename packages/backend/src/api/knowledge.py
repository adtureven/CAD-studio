"""HTTP endpoints for the RAG knowledge base."""

from __future__ import annotations

import logging
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from ..services.rag import get_knowledge_service

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_PDF_BYTES = 500 * 1024 * 1024  # 500 MB
_STREAM_CHUNK = 1024 * 1024  # 1 MB


class SearchRequest(BaseModel):
    query: str
    top_k: int = Field(default=5, ge=1, le=20)


@router.get("/docs")
async def list_docs():
    return {"docs": get_knowledge_service().list_docs()}


@router.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    filename = file.filename or "document.pdf"
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="仅支持 PDF 文件")

    tmp = tempfile.NamedTemporaryFile(prefix="kb_", suffix=".pdf", delete=False)
    tmp_path = Path(tmp.name)
    total = 0
    try:
        try:
            while True:
                chunk = await file.read(_STREAM_CHUNK)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_PDF_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail=f"PDF 超过 {MAX_PDF_BYTES // (1024 * 1024)}MB 上限",
                    )
                tmp.write(chunk)
        finally:
            tmp.close()

        if total == 0:
            raise HTTPException(status_code=400, detail="文件为空")

        service = get_knowledge_service()
        try:
            meta = await service.add_pdf_from_path(filename, tmp_path, total)
        except RuntimeError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        except Exception as exc:
            logger.exception("知识库入库失败")
            raise HTTPException(status_code=500, detail=f"入库失败：{exc}")
        return {"doc": meta}
    finally:
        if tmp_path.exists():
            tmp_path.unlink(missing_ok=True)


@router.delete("/docs/{doc_id}")
async def delete_doc(doc_id: str):
    ok = get_knowledge_service().delete_doc(doc_id)
    if not ok:
        raise HTTPException(status_code=404, detail="文档不存在")
    return {"ok": True}


@router.post("/search")
async def search(req: SearchRequest):
    hits = await get_knowledge_service().search(req.query, top_k=req.top_k)
    return {"hits": hits}
