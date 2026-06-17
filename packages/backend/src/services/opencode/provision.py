"""Provision the opencode workspace: root config, per-session directory and assets.

opencode serve is rooted at a single project directory. We use
``generated/agent_sessions/`` as that root and give each conversation its own
subdirectory holding the only file the agent may edit: ``cadquery.py``.
"""

import json
from pathlib import Path

from ...config import settings

CAD_FILE_NAME = "cadquery.py"
ROOT_CONFIG_NAME = "opencode.json"
AGENTS_FILE_NAME = "AGENTS.md"
_SYSTEM_PROMPT_PATH = (
    Path(__file__).resolve().parents[1] / "ai" / "prompts" / "system_cad_agent.md"
)

_DEFAULT_CAD_SOURCE = (
    "import cadquery as cq\n\n"
    "params = {\n"
    '    "width": 100.0,\n'
    '    "depth": 60.0,\n'
    '    "height": 20.0,\n'
    "}\n\n"
    'result = cq.Workplane("XY").box(params["width"], params["depth"], params["height"])\n'
)


def _backend_root() -> Path:
    # src/services/opencode/provision.py -> backend package root (parents[3]).
    return Path(__file__).resolve().parents[3]


def opencode_root() -> Path:
    root = _backend_root() / "generated" / "agent_sessions"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _provider_api_key() -> str:
    return settings.anthropic_api_key or settings.gateway_api_key


def build_root_config() -> dict:
    provider_id = settings.opencode_provider_id
    model = settings.default_model
    return {
        "$schema": "https://opencode.ai/config.json",
        "provider": {
            provider_id: {
                "npm": "@ai-sdk/anthropic",
                "options": {
                    "baseURL": settings.agent_base_url,
                    "apiKey": _provider_api_key(),
                },
                "models": {model: {}},
            }
        },
        "model": f"{provider_id}/{model}",
        "permission": {
            "edit": {f"**/{CAD_FILE_NAME}": "allow", "**": "deny"},
            "bash": "deny",
            "webfetch": "deny",
        },
    }


def write_root_config() -> Path:
    """Write opencode.json to the workspace root. Regenerated from .env on start."""
    config_path = opencode_root() / ROOT_CONFIG_NAME
    config_path.write_text(json.dumps(build_root_config(), indent=2, ensure_ascii=False))
    return config_path


def model_ref() -> str:
    return f"{settings.opencode_provider_id}/{settings.default_model}"


def _safe_conversation_id(value: str) -> str:
    return "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in value)[:80] or "default"


def session_dir(conversation_id: str) -> Path:
    directory = opencode_root() / _safe_conversation_id(conversation_id)
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def host_session_dir(conversation_id: str) -> str:
    """Path to the session dir as seen by opencode.

    When the backend runs in Docker and opencode runs on the host, the same
    bind-mounted files live under different absolute paths. ``opencode_host_root``
    is the host-side root; we rebase the local path onto it. Empty config means
    backend and opencode share a filesystem, so the local path is returned.
    """
    local = session_dir(conversation_id)
    host_root = settings.opencode_host_root.strip()
    if not host_root:
        return str(local)
    return str(Path(host_root) / _safe_conversation_id(conversation_id))


def _agents_md() -> str:
    base = _SYSTEM_PROMPT_PATH.read_text()
    return (
        base
        + "\n\n## opencode 运行约束\n\n"
        "- 你只能编辑当前会话目录下的 cadquery.py，禁止 shell、网络与其它文件。\n"
        "- 修改后无需自己运行渲染：后端会在你完成后自动执行 cadquery.py。\n"
        "- 必须保证 cadquery.py 是合法的 CadQuery Python，并把最终模型赋值给 result 变量。\n"
    )


def ensure_session_assets(conversation_id: str) -> Path:
    """Ensure the session directory has AGENTS.md and cadquery.py. Returns cad file path."""
    directory = session_dir(conversation_id)

    agents_file = directory / AGENTS_FILE_NAME
    agents_file.write_text(_agents_md())

    cad_file = directory / CAD_FILE_NAME
    if not cad_file.exists():
        cad_file.write_text(_DEFAULT_CAD_SOURCE)
    return cad_file
