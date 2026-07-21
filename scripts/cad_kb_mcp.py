#!/usr/bin/env python3
"""Stdio MCP server exposing the knowledge base to opencode.

Runs as an opencode-managed subprocess. Speaks the Model Context Protocol over
stdio using only stdlib, so it stays free of the backend's heavy CAD/faiss deps
— it just proxies to the backend's HTTP endpoint (``/api/knowledge/search``).

Environment:
    CAD_KB_URL      Base URL of the backend knowledge API (default
                    ``http://127.0.0.1:8000/api/knowledge``).
    CAD_KB_TIMEOUT  Per-request timeout in seconds (default 20).
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

PROTOCOL_VERSION = "2024-11-05"
SERVER_NAME = "cad-kb"
SERVER_VERSION = "0.1.0"

_KB_URL = os.environ.get("CAD_KB_URL", "http://127.0.0.1:8000/api/knowledge").rstrip("/")
_TIMEOUT = float(os.environ.get("CAD_KB_TIMEOUT", "20"))


TOOL_DEFINITION = {
    "name": "search_knowledge",
    "description": (
        "在用户上传的机械设计知识库中检索相关段落（GB/ISO 标准、齿轮设计、"
        "公差配合、材料选型、螺纹规格等）。涉及标准数值、公差、模数系列、"
        "许用应力等硬指标时，务必先调用此工具，避免凭空发明数值。"
    ),
    "inputSchema": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "自然语言检索关键词，例如 'GB/T 1357 齿轮模数系列'。",
            },
            "top_k": {
                "type": "integer",
                "description": "返回条数，默认 3，范围 1-8。",
                "minimum": 1,
                "maximum": 8,
                "default": 3,
            },
        },
        "required": ["query"],
    },
}


def _write(msg: dict) -> None:
    sys.stdout.write(json.dumps(msg, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _ok(msg_id, result: dict) -> None:
    _write({"jsonrpc": "2.0", "id": msg_id, "result": result})


def _err(msg_id, code: int, message: str) -> None:
    _write({"jsonrpc": "2.0", "id": msg_id, "error": {"code": code, "message": message}})


def _log(text: str) -> None:
    sys.stderr.write(f"[cad-kb-mcp] {text}\n")
    sys.stderr.flush()


def _http_post_json(path: str, body: dict) -> dict:
    url = f"{_KB_URL}{path}"
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
        raw = resp.read()
    return json.loads(raw.decode("utf-8"))


def _format_hits_for_model(query: str, hits: list) -> str:
    if not hits:
        return f"知识库中未找到与「{query}」相关的段落。"
    lines = []
    for i, hit in enumerate(hits, 1):
        if not isinstance(hit, dict):
            continue
        header = f"[{i}] {hit.get('filename') or '?'} · 第 {hit.get('page', 0)} 页"
        heading = hit.get("heading")
        if heading:
            header += f" · {heading}"
        score = hit.get("score")
        if isinstance(score, (int, float)):
            header += f" · score={score}"
        lines.append(header)
        lines.append(str(hit.get("text", "")).strip())
        lines.append("")
    return "\n".join(lines).strip()


def _handle_tool_call(name: str, arguments: dict) -> dict:
    if name != TOOL_DEFINITION["name"]:
        return {
            "content": [{"type": "text", "text": f"未知工具：{name}"}],
            "isError": True,
        }
    query = str(arguments.get("query") or "").strip()
    if not query:
        return {
            "content": [{"type": "text", "text": "search_knowledge 需要非空的 query 参数。"}],
            "isError": True,
        }
    try:
        top_k = int(arguments.get("top_k") or 3)
    except (TypeError, ValueError):
        top_k = 3
    top_k = max(1, min(top_k, 8))

    try:
        data = _http_post_json("/search", {"query": query, "top_k": top_k})
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:300]
        return {
            "content": [{"type": "text", "text": f"检索失败（HTTP {exc.code}）：{detail}"}],
            "isError": True,
        }
    except Exception as exc:
        return {
            "content": [{"type": "text", "text": f"检索失败：{exc}"}],
            "isError": True,
        }

    hits = data.get("hits") if isinstance(data, dict) else []
    if not isinstance(hits, list):
        hits = []
    text = _format_hits_for_model(query, hits)
    return {"content": [{"type": "text", "text": text}], "isError": False}


def _handle(msg: dict) -> None:
    method = msg.get("method")
    msg_id = msg.get("id")

    if method == "initialize":
        _ok(
            msg_id,
            {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
            },
        )
        return

    if method == "notifications/initialized":
        return

    if method == "tools/list":
        _ok(msg_id, {"tools": [TOOL_DEFINITION]})
        return

    if method == "tools/call":
        params = msg.get("params") or {}
        name = params.get("name") or ""
        arguments = params.get("arguments") or {}
        if not isinstance(arguments, dict):
            arguments = {}
        result = _handle_tool_call(name, arguments)
        _ok(msg_id, result)
        return

    if method == "ping":
        _ok(msg_id, {})
        return

    if isinstance(method, str) and method.startswith("notifications/"):
        return

    if msg_id is not None:
        _err(msg_id, -32601, f"Method not found: {method}")


def main() -> int:
    _log(f"starting; kb_url={_KB_URL} timeout={_TIMEOUT}s")
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError as exc:
            _log(f"drop malformed line: {exc}")
            continue
        try:
            _handle(msg)
        except Exception as exc:
            _log(f"handler crashed: {exc}")
            msg_id = msg.get("id") if isinstance(msg, dict) else None
            if msg_id is not None:
                _err(msg_id, -32603, f"internal error: {exc}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
