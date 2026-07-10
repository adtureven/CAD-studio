"""PDF text extraction and chunking for the knowledge base.

Uses PyMuPDF (fitz) to keep dependencies light and preserve page numbers.
Chunks are heading-aware where possible, otherwise fall back to a sliding
window over paragraphs.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, asdict
from pathlib import Path


@dataclass
class Chunk:
    chunk_id: str
    doc_id: str
    text: str
    page: int
    heading: str
    char_start: int
    char_end: int

    def to_dict(self) -> dict:
        return asdict(self)


_HEADING_RE = re.compile(r"^(第[一二三四五六七八九十百]+[章节]|[0-9]+(\.[0-9]+){0,3}\s+\S)")


def _looks_like_heading(line: str) -> bool:
    stripped = line.strip()
    if not stripped or len(stripped) > 80:
        return False
    if _HEADING_RE.match(stripped):
        return True
    return False


def extract_pages(pdf_path: Path) -> list[tuple[int, str]]:
    """Return [(page_number, text)] for each page in the PDF."""
    import fitz  # pymupdf

    doc = fitz.open(pdf_path)
    try:
        pages: list[tuple[int, str]] = []
        for page_index in range(doc.page_count):
            page = doc.load_page(page_index)
            text = page.get_text("text") or ""
            pages.append((page_index + 1, text))
        return pages
    finally:
        doc.close()


def chunk_pages(
    pages: list[tuple[int, str]],
    doc_id: str,
    chunk_size: int = 800,
    overlap: int = 150,
) -> list[Chunk]:
    """Slice per-page text into overlapping chunks, tracking headings/pages."""
    chunks: list[Chunk] = []
    current_heading = ""
    counter = 0
    for page_num, raw in pages:
        text = _normalise(raw)
        if not text:
            continue

        for line in text.splitlines():
            if _looks_like_heading(line):
                current_heading = line.strip()
                break

        pos = 0
        length = len(text)
        while pos < length:
            end = min(pos + chunk_size, length)
            slice_text = text[pos:end].strip()
            if len(slice_text) >= 40:
                counter += 1
                chunks.append(
                    Chunk(
                        chunk_id=f"{doc_id}:{counter:04d}",
                        doc_id=doc_id,
                        text=slice_text,
                        page=page_num,
                        heading=current_heading,
                        char_start=pos,
                        char_end=end,
                    )
                )
            if end >= length:
                break
            pos = max(end - overlap, pos + 1)
    return chunks


def _normalise(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
