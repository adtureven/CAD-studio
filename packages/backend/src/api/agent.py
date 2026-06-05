import asyncio
import contextlib
import json
import os
import shutil
from pathlib import Path

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..config import settings
from ..services.cad.executor import execute_cadquery

router = APIRouter()

MIMO_ANTHROPIC_BASE_URL = "https://token-plan-sgp.xiaomimimo.com/anthropic"
DEFAULT_MODEL = "mimo-v2.5-pro"
CAD_FILE_NAME = "cadquery.py"
CAD_SYSTEM_PROMPT_PATH = Path(__file__).parent.parent / "services" / "ai" / "prompts" / "system_cad_agent.md"
MAX_CAD_REPAIR_TURNS = 2

_sessions: dict[str, str] = {}


def _safe_conversation_id(value: str) -> str:
    return "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in value)[:80] or "default"


def _generated_dir(*parts: str) -> Path:
    directory = Path(__file__).resolve().parents[2] / "generated" / Path(*parts)
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def _session_dir(conversation_id: str) -> Path:
    return _generated_dir("agent_sessions", _safe_conversation_id(conversation_id))


def _claude_config_dir() -> Path:
    return _generated_dir("claude_config")


def _ensure_cadquery_file(directory: Path) -> Path:
    cad_file = directory / CAD_FILE_NAME
    if not cad_file.exists():
        cad_file.write_text(
            'import cadquery as cq\n\n'
            'params = {\n'
            '    "width": 100.0,\n'
            '    "depth": 60.0,\n'
            '    "height": 20.0,\n'
            '}\n\n'
            'result = cq.Workplane("XY").box(params["width"], params["depth"], params["height"])\n'
        )
    return cad_file


def _cleanup_session_dir(directory: Path):
    for child in directory.iterdir():
        if child.name == CAD_FILE_NAME:
            continue
        if child.is_file() or child.is_symlink():
            child.unlink(missing_ok=True)
        elif child.is_dir():
            shutil.rmtree(child, ignore_errors=True)


def _agent_prompt(user_message: str) -> str:
    return f"""{user_message}

You are editing the only CAD source file in this session: ./cadquery.py.
Read and modify only ./cadquery.py. Do not create, rename, or edit any other file.
The file must contain valid CadQuery Python code and assign the final model to result.
After updating ./cadquery.py, reply with a short summary of what changed."""


def _cad_repair_prompt(error: str, attempt: int) -> str:
    return f"""The CAD backend executed ./cadquery.py and failed on validation/render attempt {attempt}.

Error:
{error}

Use the available tools to inspect and fix ./cadquery.py. Keep the final model assigned to result.
After editing, reply with a short summary of the fix."""


@router.websocket("/ws")
async def agent_websocket(websocket: WebSocket):
    await websocket.accept()

    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") != "agent_request":
                continue
            await _run_agent_turn(websocket, data.get("payload", {}))
    except WebSocketDisconnect:
        pass


async def _run_agent_turn(websocket: WebSocket, payload: dict):
    message = (payload.get("message") or "").strip()
    if not message:
        return

    conversation_id = payload.get("conversation_id") or "default"
    model = payload.get("model") or DEFAULT_MODEL
    api_key = settings.anthropic_api_key or settings.gateway_api_key

    if not api_key:
        await websocket.send_json({
            "type": "agent_error",
            "payload": {"message": "Missing Mimo/Anthropic API key"},
        })
        return

    claude_bin = os.environ.get("CLAUDE_CODE_BIN") or shutil.which("claude")
    if not claude_bin:
        fallback = Path.home() / ".local" / "bin" / "claude"
        claude_bin = str(fallback) if fallback.exists() else ""

    if not claude_bin:
        await websocket.send_json({
            "type": "agent_error",
            "payload": {"message": "Claude Code CLI not found. Set CLAUDE_CODE_BIN or install claude."},
        })
        return

    agent_cwd = _session_dir(conversation_id)
    claude_config_dir = _claude_config_dir()
    cad_file = _ensure_cadquery_file(agent_cwd)

    env = os.environ.copy()
    env.update({
        "ANTHROPIC_BASE_URL": MIMO_ANTHROPIC_BASE_URL,
        "ANTHROPIC_API_KEY": api_key,
        "ANTHROPIC_MODEL": model,
        "CLAUDE_CONFIG_DIR": str(claude_config_dir),
    })

    return_code = await _run_claude_code(
        websocket=websocket,
        conversation_id=conversation_id,
        model=model,
        claude_bin=claude_bin,
        agent_cwd=agent_cwd,
        env=env,
        prompt=_agent_prompt(message),
    )

    if return_code != 0:
        await websocket.send_json({
            "type": "agent_done",
            "payload": {"return_code": return_code, "conversation_id": conversation_id},
        })
        return

    for attempt in range(MAX_CAD_REPAIR_TURNS + 1):
        _cleanup_session_dir(agent_cwd)
        cad_result = await _render_cadquery_file(websocket, conversation_id, cad_file)
        if cad_result.get("success"):
            await websocket.send_json({
                "type": "agent_done",
                "payload": {"return_code": 0, "conversation_id": conversation_id},
            })
            return

        if attempt >= MAX_CAD_REPAIR_TURNS:
            await websocket.send_json({
                "type": "agent_done",
                "payload": {"return_code": 0, "conversation_id": conversation_id},
            })
            return

        error = str(cad_result.get("error") or "CAD execution failed")
        await websocket.send_json({
            "type": "agent_repair_start",
            "payload": {
                "attempt": attempt + 1,
                "max_attempts": MAX_CAD_REPAIR_TURNS,
                "error": error,
                "conversation_id": conversation_id,
            },
        })

        return_code = await _run_claude_code(
            websocket=websocket,
            conversation_id=conversation_id,
            model=model,
            claude_bin=claude_bin,
            agent_cwd=agent_cwd,
            env=env,
            prompt=_cad_repair_prompt(error, attempt + 1),
        )
        if return_code != 0:
            await websocket.send_json({
                "type": "agent_done",
                "payload": {"return_code": return_code, "conversation_id": conversation_id},
            })
            return


async def _run_claude_code(
    *,
    websocket: WebSocket,
    conversation_id: str,
    model: str,
    claude_bin: str,
    agent_cwd: Path,
    env: dict[str, str],
    prompt: str,
) -> int:
    cmd = [
        claude_bin,
        "-p",
        prompt,
        "--bare",
        "--verbose",
        "--output-format",
        "stream-json",
        "--system-prompt-file",
        str(CAD_SYSTEM_PROMPT_PATH),
        "--tools",
        "default",
        "--permission-mode",
        "bypassPermissions",
    ]

    session_id = _sessions.get(conversation_id)
    if session_id:
        cmd.extend(["--resume", session_id])

    await websocket.send_json({
        "type": "agent_start",
        "payload": {"conversation_id": conversation_id, "model": model},
    })

    process = await asyncio.create_subprocess_exec(
        *cmd,
        cwd=str(agent_cwd),
        env=env,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    async def send_heartbeat():
        while process.returncode is None:
            await asyncio.sleep(8)
            if process.returncode is not None:
                break
            try:
                await websocket.send_json({
                    "type": "agent_heartbeat",
                    "payload": {"conversation_id": conversation_id},
                })
            except Exception:
                break

    async def read_stdout():
        assert process.stdout is not None
        async for raw_line in process.stdout:
            line = raw_line.decode(errors="replace").strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                await websocket.send_json({
                    "type": "agent_text",
                    "payload": {"content": line, "conversation_id": conversation_id},
                })
                continue

            if isinstance(event, dict):
                session = event.get("session_id") or event.get("sessionId")
                if isinstance(session, str) and session:
                    _sessions[conversation_id] = session

            await websocket.send_json({
                "type": "agent_event",
                "payload": {"event": event, "conversation_id": conversation_id},
            })

    async def read_stderr():
        assert process.stderr is not None
        async for raw_line in process.stderr:
            line = raw_line.decode(errors="replace").strip()
            if line:
                await websocket.send_json({
                    "type": "agent_stderr",
                    "payload": {"content": line, "conversation_id": conversation_id},
                })

    heartbeat_task = asyncio.create_task(send_heartbeat())
    try:
        await asyncio.gather(read_stdout(), read_stderr())
        return await process.wait()
    finally:
        heartbeat_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await heartbeat_task


async def _render_cadquery_file(websocket: WebSocket, conversation_id: str, cad_file: Path):
    code = cad_file.read_text()
    await websocket.send_json({
        "type": "agent_code",
        "payload": {
            "code": code,
            "path": str(cad_file),
            "conversation_id": conversation_id,
        },
    })

    await websocket.send_json({
        "type": "agent_cad_executing",
        "payload": {"conversation_id": conversation_id},
    })

    result = execute_cadquery(code)
    if result["success"]:
        await websocket.send_json({
            "type": "agent_cad_result",
            "payload": {
                "model_url": result["model_url"],
                "format": result.get("format", "step"),
                "parameters": result.get("parameters", []),
                "conversation_id": conversation_id,
            },
        })
        return result

    await websocket.send_json({
        "type": "agent_cad_error",
        "payload": {
            "error": result.get("error", "CAD execution failed"),
            "conversation_id": conversation_id,
        },
    })
    return result
