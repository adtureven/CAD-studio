#!/usr/bin/env python3
"""Generate opencode.json from models.json (or GATEWAY_* env fallback).

Each model becomes its own opencode provider (providerID == modelID == the
model id) so models with different endpoints/keys all work. Run by
scripts/opencode.sh before launching the server.

Usage: gen_opencode_config.py <output_path>
Reads models.json from the project root; falls back to env vars when absent.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODELS_FILE = ROOT / "models.json"

MODEL_CAPS = {
    "attachment": True,
    "tool_call": True,
    "modalities": {"input": ["text", "image"], "output": ["text"]},
}

PERMISSION = {
    "edit": {"*": "deny", "**/cadquery.py": "allow"},
    "skill": {"cadquery-studio": "allow", "cad-vision-brief": "allow"},
    "question": "deny",
    "bash": "deny",
    "webfetch": "deny",
}


def _models_from_file(data: dict) -> list[dict]:
    out = []
    for item in data.get("models", []):
        mid = (item.get("id") or "").strip()
        if not mid:
            continue
        out.append({
            "id": mid,
            "base_url": (item.get("base_url") or "").strip(),
            "api_key": (item.get("api_key") or "").strip(),
        })
    return out


def _models_from_env() -> list[dict]:
    ids = [m.strip() for m in os.environ.get("GATEWAY_MODELS", "").split(",") if m.strip()]
    if not ids:
        d = os.environ.get("DEFAULT_MODEL", "").strip()
        ids = [d] if d else []
    base_url = (
        os.environ.get("OPENCODE_PROVIDER_BASE_URL")
        or os.environ.get("GATEWAY_URL")
        or os.environ.get("AGENT_BASE_URL")
        or ""
    ).strip()
    api_key = (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("GATEWAY_API_KEY") or "").strip()
    return [{"id": mid, "base_url": base_url, "api_key": api_key} for mid in ids]


def _default_id(data: dict | None, models: list[dict]) -> str:
    if data:
        declared = (data.get("default") or "").strip()
        if declared and any(m["id"] == declared for m in models):
            return declared
    env_default = os.environ.get("DEFAULT_MODEL", "").strip()
    if env_default and any(m["id"] == env_default for m in models):
        return env_default
    return models[0]["id"] if models else ""


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: gen_opencode_config.py <output_path>", file=sys.stderr)
        return 2
    out_path = Path(sys.argv[1])

    data = None
    if MODELS_FILE.exists():
        try:
            data = json.loads(MODELS_FILE.read_text())
        except json.JSONDecodeError as exc:
            print(f"models.json 解析失败：{exc}", file=sys.stderr)
            return 1

    models = _models_from_file(data) if data else _models_from_env()
    models = [m for m in models if m["base_url"] and m["api_key"]]
    if not models:
        print("没有可用模型：请配置 models.json 或 GATEWAY_* 环境变量。", file=sys.stderr)
        return 1

    default_id = _default_id(data, models)

    providers = {}
    for m in models:
        providers[m["id"]] = {
            "npm": "@ai-sdk/openai-compatible",
            "options": {"baseURL": m["base_url"], "apiKey": m["api_key"]},
            "models": {m["id"]: dict(MODEL_CAPS)},
        }

    config = {
        "$schema": "https://opencode.ai/config.json",
        "provider": providers,
        "model": f"{default_id}/{default_id}",
        "permission": PERMISSION,
    }

    out_path.write_text(json.dumps(config, indent=2, ensure_ascii=False))
    ids = ", ".join(m["id"] for m in models)
    print(f"opencode 配置已生成：{out_path}（默认={default_id}，模型=[{ids}]）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
