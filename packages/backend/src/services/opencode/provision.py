"""Provision the opencode workspace: root config, per-session directory and assets.

opencode serve is rooted at a single project directory. We use
``generated/agent_sessions/`` as that root and give each conversation its own
subdirectory holding the only file the agent may edit: ``cadquery.py``.
"""

import json
import sys
from pathlib import Path

from ...config import settings
from ..ai import model_config

CAD_FILE_NAME = "cadquery.py"
ROOT_CONFIG_NAME = "opencode.json"
AGENTS_FILE_NAME = "AGENTS.md"
_SYSTEM_PROMPT_PATH = (
    Path(__file__).resolve().parents[1] / "ai" / "prompts" / "system_cad_agent.md"
)
_PROJECT_ROOT = Path(__file__).resolve().parents[4]
_MCP_SCRIPT = _PROJECT_ROOT / "scripts" / "cad_kb_mcp.py"
MCP_SERVER_ID = "cad-kb"
MCP_TOOL_NAME = f"{MCP_SERVER_ID}_search_knowledge"

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


def _provider_base_url() -> str:
    return (
        settings.opencode_provider_base_url
        or settings.gateway_url
        or settings.agent_base_url
        or "https://token-plan-sgp.xiaomimimo.com/v1"
    )


def build_root_config() -> dict:
    models = [
        model
        for model in model_config.load_models()
        if model.base_url and model.api_key
    ]
    configured_default = model_config.default_model_id()
    allowed = {model.id for model in models}
    default_model = configured_default if configured_default in allowed else (
        models[0].id if models else configured_default
    )
    providers = {
        model.id: {
            "npm": "@ai-sdk/openai-compatible",
            "options": {
                "baseURL": model.base_url,
                "apiKey": model.api_key,
            },
            "models": {
                model.id: {
                    "attachment": True,
                    "tool_call": True,
                    "modalities": {
                        "input": ["text", "image"],
                        "output": ["text"],
                    },
                }
            },
        }
        for model in models
    }
    return {
        "$schema": "https://opencode.ai/config.json",
        "provider": providers,
        "model": f"{default_model}/{default_model}",
        "permission": {
            "edit": {f"**/{CAD_FILE_NAME}": "allow", "**": "deny"},
            "skill": {
                "cadquery-studio": "allow",
                "cad-vision-brief": "allow",
                "knowledge-base": "allow",
            },
            "question": "deny",
            "bash": "deny",
            "webfetch": "deny",
        },
        "mcp": {
            MCP_SERVER_ID: {
                "type": "local",
                "command": [sys.executable or "python3", "-u", str(_MCP_SCRIPT)],
                "enabled": True,
                "environment": {
                    "CAD_KB_URL": (
                        f"http://127.0.0.1:{settings.backend_port}/api/knowledge"
                    ),
                },
            },
        },
        "tools": {MCP_TOOL_NAME: True},
    }


def write_root_config() -> Path:
    """Write opencode.json to the workspace root. Regenerated from .env on start."""
    config_path = opencode_root() / ROOT_CONFIG_NAME
    config_path.write_text(json.dumps(build_root_config(), indent=2, ensure_ascii=False))
    return config_path


def model_ref() -> str:
    model = model_config.default_model_id()
    return f"{model}/{model}"


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
        "- 你只能编辑当前会话目录下的 cadquery.py；可以读取已允许的 skill 指令和参考文件；禁止 shell、网络与其它项目文件。\n"
        "- 不要向用户提问或等待确认（question 工具已禁用）。需求不明确时，自行做出合理的工程假设直接建模，并在代码注释或最终总结里说明你的假设。\n"
        "- 可用技能：cadquery-studio 负责 CadQuery 建模与修复；cad-vision-brief 负责把图片、截图、扫描件、草图或制图提炼成结构化 CAD brief；knowledge-base 负责从用户上传的手册/国标 PDF 中检索标准数值。\n"
        "- 如果输入里有图片或图纸，通常先用 cad-vision-brief 提炼 brief，再用 cadquery-studio 建模；如果文字已经足够清楚，可直接进入 cadquery-studio。不要把这条做成固定路由，按任务复杂度自主选择。\n"
        "- 建模、修改或修复 CAD 时必须使用 cadquery-studio skill，并按其中的质量门槛检查需求覆盖、参数安全、几何稳定和渲染结果。\n"
        f"- 涉及国标/ISO 标准数值、模数、公差配合、螺纹规格、材料许用应力等硬指标时，先按 knowledge-base skill 的规范调用 MCP 工具 `{MCP_TOOL_NAME}` 检索，再据此建模；具体查询策略、失败处理与引用格式见该 skill。禁止凭空发明这些数值。\n"
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
