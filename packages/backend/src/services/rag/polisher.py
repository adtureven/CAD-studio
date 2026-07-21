"""LLM polish for knowledge base hits.

Raw PDF text extracted by PyMuPDF is full of hard line breaks, header/footer
noise, hyphenated words and cross-column jumps. Before showing hits to the
user we ask a small/cheap model to clean each snippet into readable Chinese
prose, keeping the exact numbers, units and standard IDs untouched.

Design constraints:
- Only affects what the frontend renders (``polished_text`` field); the raw
  ``text`` is still what the CAD agent tool call sees.
- Best-effort — any failure silently falls back to the raw text so RAG is
  never blocked by the polish call.
- Concurrent per hit, capped to a small pool to avoid gateway rate limits.
"""

from __future__ import annotations

import asyncio
import logging
import re

import httpx
import openai

from ..ai import model_config

logger = logging.getLogger(__name__)

_MAX_INPUT_CHARS = 900
_MAX_OUTPUT_TOKENS = 400
_TIMEOUT = httpx.Timeout(20.0, connect=5.0)
_CONCURRENCY = 4

_SYSTEM_PROMPT = (
    "你是机械设计资料整理助手。用户会给你一段从 PDF 抽取出来的段落，"
    "由于原始文档是双栏 / 有页眉页脚 / 换行错乱，读起来很差。"
    "你的任务是把它整理成干净、可读的中文，让工程师一眼看懂。\n\n"
    "严格遵守：\n"
    "1. 只做排版和语句梳理：合并被硬换行拆散的句子、去掉页眉页脚 / 页码 / 水印、"
    "补齐被连字符断开的单词、把表格数据整理成清晰的列表或表格。\n"
    "2. 一切数值、公式、单位、代号、标准编号（如 GB/T 1357、ISO 286、H7/g6、m=3）"
    "必须**逐字保留**，不得改写、四舍五入、单位换算或推断。\n"
    "3. 不要添加原文没有的解释、举例、评价或结论。\n"
    "4. 不要总结成一句话——保持原意与信息量，只做可读性优化。\n"
    "5. 如果原文本身就已经清晰，直接原样返回。\n"
    "6. 输出纯 Markdown（可以用列表、简单表格），不要包 ```markdown``` 代码块。"
)


class Polisher:
    def __init__(self) -> None:
        self._client: openai.AsyncOpenAI | None = None
        self._model_id: str | None = None
        self._resolve()

    def _resolve(self) -> None:
        default_id = model_config.default_model_id()
        chosen = next(
            (
                m
                for m in model_config.load_models()
                if m.id == default_id and m.base_url and m.api_key
            ),
            None,
        )
        if chosen is None:
            return
        self._model_id = chosen.id
        self._client = openai.AsyncOpenAI(
            base_url=chosen.base_url,
            api_key=chosen.api_key,
            timeout=_TIMEOUT,
        )

    @property
    def enabled(self) -> bool:
        return self._client is not None and bool(self._model_id)

    async def polish_hits(self, hits: list[dict]) -> list[dict]:
        if not hits or not self.enabled:
            return hits

        sem = asyncio.Semaphore(_CONCURRENCY)

        async def _one(hit: dict) -> dict:
            text = str(hit.get("text") or "")
            if not text.strip():
                return hit
            trimmed = _prepare_input(text)
            async with sem:
                polished = await self._polish_one(trimmed, hit)
            if polished and polished != trimmed:
                return {**hit, "polished_text": polished}
            return hit

        return await asyncio.gather(*(_one(h) for h in hits))

    async def _polish_one(self, text: str, hit: dict) -> str:
        assert self._client is not None and self._model_id is not None
        header = (
            f"来源：{hit.get('filename') or '?'} · 第 {hit.get('page', 0)} 页"
            + (f" · {hit['heading']}" if hit.get("heading") else "")
        )
        user_msg = f"{header}\n\n原文：\n{text}\n\n请输出整理后的中文段落。"
        try:
            resp = await self._client.chat.completions.create(
                model=self._model_id,
                messages=[
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user", "content": user_msg},
                ],
                temperature=0.2,
                max_tokens=_MAX_OUTPUT_TOKENS,
            )
        except Exception as exc:
            logger.debug("polish 失败，回退原文：%s", exc)
            return ""
        try:
            content = resp.choices[0].message.content or ""
        except (AttributeError, IndexError):
            return ""
        return _clean_output(content)


def _prepare_input(text: str) -> str:
    text = text.strip()
    if len(text) > _MAX_INPUT_CHARS:
        text = text[:_MAX_INPUT_CHARS] + "…"
    return text


_FENCE_RE = re.compile(r"^```(?:markdown)?\s*|\s*```$", re.IGNORECASE)


def _clean_output(text: str) -> str:
    text = text.strip()
    # Drop code fences if the model wrapped its reply in one.
    text = _FENCE_RE.sub("", text).strip()
    return text


_polisher: Polisher | None = None


def get_polisher() -> Polisher:
    global _polisher
    if _polisher is None:
        _polisher = Polisher()
    return _polisher
