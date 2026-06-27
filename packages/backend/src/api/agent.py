import asyncio
import contextlib
from pathlib import Path

import anthropic
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..config import settings
from ..services.ai import model_config
from ..services.ai.base import split_image_data
from ..services.cad.executor import execute_cadquery
from ..services.opencode import client as opencode_client
from ..services.opencode import provision as opencode_provision

router = APIRouter()

CAD_FILE_NAME = "cadquery.py"
CAD_SYSTEM_PROMPT_PATH = Path(__file__).parent.parent / "services" / "ai" / "prompts" / "system_cad_agent.md"
MAX_CAD_REPAIR_TURNS = 2
MAX_TOOL_ITERATIONS = 24
MAX_TOKENS = 32000
THINKING_BUDGET_TOKENS = 1024
# Keep multi-turn memory bounded so token usage does not grow without limit.
MAX_HISTORY_MESSAGES = 40

# Per-conversation message history powering multi-turn memory (legacy loop).
_histories: dict[str, list[dict]] = {}

# Maps a conversation id to its opencode session id (opencode owns the memory).
_opencode_sessions: dict[str, str] = {}

TOOLS = [
    {
        "name": "read_cad",
        "description": "读取当前会话 cadquery.py 的完整内容。",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "write_cad",
        "description": (
            "用新的完整文件内容覆盖 cadquery.py。"
            "必须传入完整文件，而不是差异片段。代码必须是合法的 CadQuery Python，"
            "并把最终模型赋值给名为 result 的变量。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "content": {
                    "type": "string",
                    "description": "cadquery.py 的完整新内容。",
                }
            },
            "required": ["content"],
        },
    },
    {
        "name": "render_cad",
        "description": (
            "执行当前 cadquery.py 并渲染模型，用于自检。"
            "成功时返回模型信息与解析出的参数；失败时返回错误信息，"
            "你应据此修复 cadquery.py 后再次渲染。"
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
]


def _safe_conversation_id(value: str) -> str:
    return "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in value)[:80] or "default"


def _generated_dir(*parts: str) -> Path:
    directory = Path(__file__).resolve().parents[2] / "generated" / Path(*parts)
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def _session_dir(conversation_id: str) -> Path:
    return _generated_dir("agent_sessions", _safe_conversation_id(conversation_id))


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


def _trim_history(history: list[dict]):
    # Drop oldest messages when the conversation grows too long, keeping the
    # list valid by never starting on an assistant turn or an orphan tool_result.
    while len(history) > MAX_HISTORY_MESSAGES:
        del history[0]
    while history and not _is_clean_start(history[0]):
        del history[0]


def _is_clean_start(message: dict) -> bool:
    if message.get("role") != "user":
        return False
    content = message.get("content")
    if isinstance(content, list):
        return not any(
            isinstance(block, dict) and block.get("type") == "tool_result" for block in content
        )
    return True


def _agent_prompt(user_message: str) -> str:
    return f"""{user_message}

你正在编辑本会话中唯一的 CAD 源文件 cadquery.py。
请用 read_cad 查看、write_cad 更新、render_cad 渲染校验。
修改后务必调用 render_cad 验证模型能成功生成；若失败，根据错误修复后重新渲染。
完成后用简短中文说明你做了什么。"""


@router.websocket("/ws")
async def agent_websocket(websocket: WebSocket):
    await websocket.accept()

    active_opencode_session: dict[str, str | None] = {"id": None}

    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") != "agent_request":
                continue
            if settings.opencode_enabled:
                await _run_agent_turn_opencode(
                    websocket, data.get("payload", {}), active_opencode_session
                )
            else:
                await _run_agent_turn(websocket, data.get("payload", {}))
    except WebSocketDisconnect:
        session_id = active_opencode_session.get("id")
        if session_id:
            await opencode_client.abort(session_id)


async def _run_agent_turn(websocket: WebSocket, payload: dict):
    message = (payload.get("message") or "").strip()
    if not message:
        return

    conversation_id = payload.get("conversation_id") or "default"
    model = payload.get("model") or model_config.default_model_id()
    api_key = settings.anthropic_api_key or settings.gateway_api_key

    if not api_key:
        await websocket.send_json({
            "type": "agent_error",
            "payload": {"message": "缺少 Mimo/Anthropic API key", "conversation_id": conversation_id},
        })
        return

    client = anthropic.AsyncAnthropic(base_url=settings.agent_base_url, api_key=api_key)
    system_prompt = CAD_SYSTEM_PROMPT_PATH.read_text()

    agent_cwd = _session_dir(conversation_id)
    cad_file = _ensure_cadquery_file(agent_cwd)

    history = _histories.setdefault(conversation_id, [])
    history.append({"role": "user", "content": _agent_prompt(message)})

    state = {"last_render_ok": False}

    await websocket.send_json({
        "type": "agent_start",
        "payload": {"conversation_id": conversation_id, "model": model},
    })

    ok = await _run_agent_loop(
        websocket=websocket,
        conversation_id=conversation_id,
        model=model,
        client=client,
        system_prompt=system_prompt,
        cad_file=cad_file,
        history=history,
        state=state,
    )

    if not ok:
        await _send_status(websocket, conversation_id, "error", "Agent 执行失败")
        await websocket.send_json({
            "type": "agent_done",
            "payload": {"return_code": 1, "conversation_id": conversation_id},
        })
        return

    # If the agent never produced a successful render, fall back to an
    # automatic render + repair loop so the viewport still updates.
    if not state["last_render_ok"]:
        await _auto_render_and_repair(
            websocket=websocket,
            conversation_id=conversation_id,
            model=model,
            client=client,
            system_prompt=system_prompt,
            cad_file=cad_file,
            history=history,
            state=state,
        )

    await _send_status(websocket, conversation_id, "done", "完成")
    await websocket.send_json({
        "type": "agent_done",
        "payload": {"return_code": 0, "conversation_id": conversation_id},
    })


# ---------------------------------------------------------------------------
# opencode-backed agent turn
# ---------------------------------------------------------------------------

# Map opencode tool names onto the labels the frontend already knows.
_OPENCODE_TOOL_LABELS = {
    "write": "write_cad",
    "edit": "write_cad",
    "read": "read_cad",
    "patch": "write_cad",
}


def _map_tool_name(name: str) -> str:
    return _OPENCODE_TOOL_LABELS.get(name, name)


def _resolve_opencode_model(requested: str | None) -> str:
    """Pick the model to send to opencode.

    Only models declared in models.json (or the GATEWAY_* fallback) are
    registered as opencode providers, so fall back to the configured default
    when the frontend sends an unknown/empty value.
    """
    models = model_config.load_models()
    allowed = {m.id for m in models}
    if requested and requested in allowed:
        return requested
    return model_config.default_model_id()


async def _run_agent_turn_opencode(
    websocket: WebSocket,
    payload: dict,
    active_session: dict,
):
    message = (payload.get("message") or "").strip()
    images = payload.get("images") or []
    if not message and not images:
        return

    conversation_id = payload.get("conversation_id") or "default"
    model = _resolve_opencode_model(payload.get("model"))

    if not (settings.anthropic_api_key or settings.gateway_api_key):
        await websocket.send_json({
            "type": "agent_error",
            "payload": {"message": "缺少 API key", "conversation_id": conversation_id},
        })
        return

    cad_file = opencode_provision.ensure_session_assets(conversation_id)
    directory = opencode_provision.host_session_dir(conversation_id)

    # Make sure opencode is reachable before doing anything else.
    try:
        await opencode_client.health()
    except Exception:
        await websocket.send_json({
            "type": "agent_error",
            "payload": {
                "message": "无法连接 opencode 服务，请先运行 scripts/opencode.sh 启动它。",
                "conversation_id": conversation_id,
            },
        })
        return

    try:
        session_id = _opencode_sessions.get(conversation_id)
        if not session_id:
            session_id = await opencode_client.create_session(directory, title=conversation_id)
            _opencode_sessions[conversation_id] = session_id
    except Exception as exc:
        await websocket.send_json({
            "type": "agent_error",
            "payload": {"message": f"创建 opencode 会话失败：{exc}", "conversation_id": conversation_id},
        })
        return

    active_session["id"] = session_id

    await websocket.send_json({
        "type": "agent_start",
        "payload": {"conversation_id": conversation_id, "model": model},
    })

    state = {"last_render_ok": False}

    ok = await _run_opencode_prompt(
        websocket=websocket,
        conversation_id=conversation_id,
        session_id=session_id,
        directory=directory,
        text=message,
        images=images,
        model=model,
    )

    if not ok:
        await _send_status(websocket, conversation_id, "error", "Agent 执行失败")
        await websocket.send_json({
            "type": "agent_done",
            "payload": {"return_code": 1, "conversation_id": conversation_id},
        })
        active_session["id"] = None
        return

    # opencode only edits cadquery.py; the backend owns rendering + repair.
    await _auto_render_and_repair_opencode(
        websocket=websocket,
        conversation_id=conversation_id,
        session_id=session_id,
        directory=directory,
        cad_file=cad_file,
        state=state,
        model=model,
    )

    await _send_status(websocket, conversation_id, "done", "完成")
    await websocket.send_json({
        "type": "agent_done",
        "payload": {"return_code": 0, "conversation_id": conversation_id},
    })
    active_session["id"] = None


async def _run_opencode_prompt(
    *,
    websocket: WebSocket,
    conversation_id: str,
    session_id: str,
    directory: str,
    text: str,
    images: list,
    model: str | None = None,
) -> bool:
    """Send one prompt and translate opencode SSE events into agent_* messages.

    Returns True when the session goes idle normally, False on error.
    """
    in_flight = {"active": True}

    async def send_heartbeat():
        while in_flight["active"]:
            await asyncio.sleep(8)
            if not in_flight["active"]:
                break
            with contextlib.suppress(Exception):
                await websocket.send_json({
                    "type": "agent_heartbeat",
                    "payload": {"conversation_id": conversation_id},
                })

    heartbeat_task = asyncio.create_task(send_heartbeat())

    # Bookkeeping for the turn: which message parts have streamed text, and
    # which tool calls have been announced to the frontend.
    streamed_text = {"any": False}
    tool_started: set[str] = set()
    result = {"ok": True}

    def _matches_session(props: dict, envelope: dict) -> bool:
        # Prefer the explicit sessionID on the event properties; fall back to
        # the envelope directory so we never leak another session's events.
        sid = props.get("sessionID")
        if sid is not None:
            return sid == session_id
        ev_dir = envelope.get("directory")
        return ev_dir in (None, directory)

    async def consume():
        await _send_status(websocket, conversation_id, "thinking", "模型思考中")
        async for envelope in opencode_client.events():
            payload = envelope.get("payload") or {}
            etype = payload.get("type")
            props = payload.get("properties") or {}

            if etype in ("server.connected", "server.heartbeat", "sync"):
                continue
            if not _matches_session(props, envelope):
                continue

            if etype == "message.part.delta":
                field = props.get("field")
                delta = props.get("delta")
                if not delta:
                    continue
                if field == "text":
                    streamed_text["any"] = True
                    await websocket.send_json({
                        "type": "agent_text_delta",
                        "payload": {"text": delta, "conversation_id": conversation_id},
                    })
                elif field == "reasoning":
                    await websocket.send_json({
                        "type": "agent_thinking_delta",
                        "payload": {"text": delta, "conversation_id": conversation_id},
                    })
                continue

            if etype == "message.part.updated":
                part = props.get("part") or {}
                if part.get("type") == "tool":
                    await _handle_opencode_tool_part(
                        websocket, conversation_id, part, tool_started
                    )
                continue

            if etype == "session.error":
                err = props.get("error") or props.get("message") or "opencode 会话出错"
                await websocket.send_json({
                    "type": "agent_error",
                    "payload": {"message": str(err), "conversation_id": conversation_id},
                })
                result["ok"] = False
                return

            if etype == "session.idle":
                return

    try:
        consume_task = asyncio.create_task(consume())
        # Give the SSE stream a moment to connect before prompting.
        await asyncio.sleep(0.3)
        try:
            parts = await _build_opencode_parts(conversation_id, text, images)
            await opencode_client.prompt(session_id, parts, directory, model_id=model)
        except Exception as exc:
            consume_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await consume_task
            await websocket.send_json({
                "type": "agent_error",
                "payload": {"message": f"发送 prompt 失败：{exc}", "conversation_id": conversation_id},
            })
            return False

        await consume_task

        # Flush any still-streaming text part.
        if streamed_text["any"]:
            await websocket.send_json({
                "type": "agent_text_done",
                "payload": {"conversation_id": conversation_id},
            })
        return result["ok"]
    finally:
        in_flight["active"] = False
        heartbeat_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await heartbeat_task


async def _handle_opencode_tool_part(
    websocket: WebSocket,
    conversation_id: str,
    part: dict,
    tool_started: set,
):
    raw_name = part.get("tool") or "tool"
    name = _map_tool_name(raw_name)
    pid = part.get("id") or ""
    state = part.get("state") or {}
    status = state.get("status") if isinstance(state, dict) else None
    tool_input = state.get("input") if isinstance(state, dict) else None
    if not isinstance(tool_input, dict):
        tool_input = {}

    if pid not in tool_started and status in ("pending", "running"):
        tool_started.add(pid)
        await _send_status(websocket, conversation_id, "tool", f"调用工具：{name}")
        await websocket.send_json({
            "type": "agent_tool_use",
            "payload": {
                "id": pid,
                "name": name,
                "input": tool_input,
                "conversation_id": conversation_id,
            },
        })
        return

    if status in ("completed", "error"):
        if pid not in tool_started:
            # Some events skip pending/running; still surface the call.
            tool_started.add(pid)
            await websocket.send_json({
                "type": "agent_tool_use",
                "payload": {
                    "id": pid,
                    "name": name,
                    "input": tool_input,
                    "conversation_id": conversation_id,
                },
            })
        output = ""
        if isinstance(state, dict):
            output = state.get("output") or state.get("error") or ""
        await websocket.send_json({
            "type": "agent_tool_result",
            "payload": {
                "id": pid,
                "name": name,
                "output": str(output),
                "is_error": status == "error",
                "conversation_id": conversation_id,
            },
        })


async def _auto_render_and_repair_opencode(
    *,
    websocket: WebSocket,
    conversation_id: str,
    session_id: str,
    directory: str,
    cad_file: Path,
    state: dict,
    model: str | None = None,
):
    for attempt in range(MAX_CAD_REPAIR_TURNS + 1):
        result = await _render_cadquery_file(websocket, conversation_id, cad_file)
        if result.get("success"):
            state["last_render_ok"] = True
            return

        if attempt >= MAX_CAD_REPAIR_TURNS:
            return

        error = str(result.get("error") or "CAD 执行失败")
        await _send_status(
            websocket, conversation_id, "repair",
            f"自动修复中（{attempt + 1}/{MAX_CAD_REPAIR_TURNS}）",
        )
        await websocket.send_json({
            "type": "agent_repair_start",
            "payload": {
                "attempt": attempt + 1,
                "max_attempts": MAX_CAD_REPAIR_TURNS,
                "error": error,
                "conversation_id": conversation_id,
            },
        })
        repair_prompt = (
            f"执行 cadquery.py 失败，错误如下：\n{error}\n"
            "请修复 cadquery.py（保持 result 变量与 params 字典），无需自己渲染。"
        )
        ok = await _run_opencode_prompt(
            websocket=websocket,
            conversation_id=conversation_id,
            session_id=session_id,
            directory=directory,
            text=repair_prompt,
            images=[],
            model=model,
        )
        if not ok:
            return


async def _run_agent_loop(
    *,
    websocket: WebSocket,
    conversation_id: str,
    model: str,
    client: anthropic.AsyncAnthropic,
    system_prompt: str,
    cad_file: Path,
    history: list[dict],
    state: dict,
) -> bool:
    _trim_history(history)

    in_flight = {"active": True}

    async def send_heartbeat():
        while in_flight["active"]:
            await asyncio.sleep(8)
            if not in_flight["active"]:
                break
            with contextlib.suppress(Exception):
                await websocket.send_json({
                    "type": "agent_heartbeat",
                    "payload": {"conversation_id": conversation_id},
                })

    heartbeat_task = asyncio.create_task(send_heartbeat())
    try:
        for _ in range(MAX_TOOL_ITERATIONS):
            await _send_status(websocket, conversation_id, "thinking", "模型思考中")
            try:
                final_message = await _stream_one_response(
                    websocket=websocket,
                    conversation_id=conversation_id,
                    model=model,
                    client=client,
                    system_prompt=system_prompt,
                    history=history,
                )
            except Exception as exc:
                await websocket.send_json({
                    "type": "agent_error",
                    "payload": {"message": f"模型请求失败：{exc}", "conversation_id": conversation_id},
                })
                return False

            history_content: list[dict] = []
            tool_blocks = []
            for block in final_message.content:
                if block.type == "thinking":
                    history_content.append({
                        "type": "thinking",
                        "thinking": block.thinking,
                        "signature": block.signature,
                    })
                elif block.type == "redacted_thinking":
                    history_content.append({
                        "type": "redacted_thinking",
                        "data": block.data,
                    })
                elif block.type == "text":
                    history_content.append({"type": "text", "text": block.text})
                elif block.type == "tool_use":
                    block_input = block.input if isinstance(block.input, dict) else {}
                    history_content.append({
                        "type": "tool_use",
                        "id": block.id,
                        "name": block.name,
                        "input": block_input,
                    })
                    tool_blocks.append((block.id, block.name, block_input))

            history.append({"role": "assistant", "content": history_content})

            if final_message.stop_reason == "max_tokens":
                await websocket.send_json({
                    "type": "agent_error",
                    "payload": {
                        "message": "模型输出超过长度上限被截断，未能完成本轮工具调用。请简化需求或重试。",
                        "conversation_id": conversation_id,
                    },
                })
                return False

            if final_message.stop_reason != "tool_use":
                return True

            tool_results = []
            for tool_id, tool_name, tool_input in tool_blocks:
                await websocket.send_json({
                    "type": "agent_tool_use",
                    "payload": {
                        "id": tool_id,
                        "name": tool_name,
                        "input": tool_input,
                        "conversation_id": conversation_id,
                    },
                })
                output, is_error = await _execute_tool(
                    websocket, conversation_id, tool_name, tool_input, cad_file, state
                )
                await websocket.send_json({
                    "type": "agent_tool_result",
                    "payload": {
                        "id": tool_id,
                        "name": tool_name,
                        "output": output,
                        "is_error": is_error,
                        "conversation_id": conversation_id,
                    },
                })
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_id,
                    "content": output,
                    "is_error": is_error,
                })

            history.append({"role": "user", "content": tool_results})

        return True
    finally:
        in_flight["active"] = False
        heartbeat_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await heartbeat_task


async def _stream_one_response(
    *,
    websocket: WebSocket,
    conversation_id: str,
    model: str,
    client: anthropic.AsyncAnthropic,
    system_prompt: str,
    history: list[dict],
):
    async with client.messages.stream(
        model=model,
        max_tokens=MAX_TOKENS,
        thinking={"type": "enabled", "budget_tokens": THINKING_BUDGET_TOKENS},
        system=system_prompt,
        tools=TOOLS,
        messages=history,
    ) as stream:
        async for event in stream:
            if event.type == "content_block_delta" and event.delta.type == "text_delta":
                text = event.delta.text
                if text:
                    await websocket.send_json({
                        "type": "agent_text_delta",
                        "payload": {"text": text, "conversation_id": conversation_id},
                    })
            elif event.type == "content_block_delta" and event.delta.type == "thinking_delta":
                thinking = event.delta.thinking
                if thinking:
                    await websocket.send_json({
                        "type": "agent_thinking_delta",
                        "payload": {"text": thinking, "conversation_id": conversation_id},
                    })
            elif event.type == "content_block_stop":
                await websocket.send_json({
                    "type": "agent_text_done",
                    "payload": {"conversation_id": conversation_id},
                })
        return await stream.get_final_message()


async def _execute_tool(
    websocket: WebSocket,
    conversation_id: str,
    name: str,
    tool_input: dict,
    cad_file: Path,
    state: dict,
) -> tuple[str, bool]:
    if name == "read_cad":
        await _send_status(websocket, conversation_id, "tool", "读取 cadquery.py")
        try:
            return cad_file.read_text(), False
        except Exception as exc:
            return f"读取 cadquery.py 失败：{exc}", True

    if name == "write_cad":
        await _send_status(websocket, conversation_id, "tool", "写入 cadquery.py")
        content = tool_input.get("content")
        if not isinstance(content, str):
            return "write_cad 需要字符串类型的 content 参数。", True
        try:
            cad_file.write_text(content)
            await websocket.send_json({
                "type": "agent_code",
                "payload": {
                    "code": content,
                    "path": str(cad_file),
                    "conversation_id": conversation_id,
                },
            })
            return "cadquery.py 已更新。", False
        except Exception as exc:
            return f"写入 cadquery.py 失败：{exc}", True

    if name == "render_cad":
        result = await _render_cadquery_file(websocket, conversation_id, cad_file)
        if result.get("success"):
            state["last_render_ok"] = True
            params = result.get("parameters", [])
            names = ", ".join(p.get("name", "") for p in params) or "无"
            return (
                f"渲染成功。格式：{result.get('format', 'step')}，参数：{names}。"
                f"耗时 {result.get('execution_time_ms', 0)}ms。"
            ), False
        state["last_render_ok"] = False
        return f"渲染失败：{result.get('error', 'CAD 执行失败')}", True

    return f"未知工具：{name}", True


async def _auto_render_and_repair(
    *,
    websocket: WebSocket,
    conversation_id: str,
    model: str,
    client: anthropic.AsyncAnthropic,
    system_prompt: str,
    cad_file: Path,
    history: list[dict],
    state: dict,
):
    for attempt in range(MAX_CAD_REPAIR_TURNS + 1):
        result = await _render_cadquery_file(websocket, conversation_id, cad_file)
        if result.get("success"):
            state["last_render_ok"] = True
            return

        if attempt >= MAX_CAD_REPAIR_TURNS:
            return

        error = str(result.get("error") or "CAD 执行失败")
        await _send_status(
            websocket, conversation_id, "repair",
            f"自动修复中（{attempt + 1}/{MAX_CAD_REPAIR_TURNS}）",
        )
        await websocket.send_json({
            "type": "agent_repair_start",
            "payload": {
                "attempt": attempt + 1,
                "max_attempts": MAX_CAD_REPAIR_TURNS,
                "error": error,
                "conversation_id": conversation_id,
            },
        })
        history.append({
            "role": "user",
            "content": (
                f"渲染 cadquery.py 失败，错误如下：\n{error}\n"
                "请用 read_cad / write_cad 修复，并用 render_cad 重新验证。"
            ),
        })
        ok = await _run_agent_loop(
            websocket=websocket,
            conversation_id=conversation_id,
            model=model,
            client=client,
            system_prompt=system_prompt,
            cad_file=cad_file,
            history=history,
            state=state,
        )
        if not ok:
            return
        if state["last_render_ok"]:
            return


async def _send_status(websocket: WebSocket, conversation_id: str, phase: str, label: str):
    await websocket.send_json({
        "type": "agent_status",
        "payload": {"phase": phase, "label": label, "conversation_id": conversation_id},
    })


async def _build_opencode_parts(conversation_id: str, text: str, images: list) -> list[dict]:
    parts: list[dict] = []
    has_image = False

    for index, image in enumerate(images or []):
        if not isinstance(image, str):
            continue
        value = image.strip()
        if not value:
            continue

        mime, data = split_image_data(value)
        if not data:
            continue
        has_image = True

        ext = {
            "image/png": ".png",
            "image/jpeg": ".jpg",
            "image/jpg": ".jpg",
            "image/webp": ".webp",
        }.get(mime, ".bin")
        parts.append({
            "type": "file",
            "mime": mime,
            "filename": f"prompt_image_{index + 1}{ext}",
            "url": value if value.startswith("data:") else f"data:{mime};base64,{data}",
        })

    if text:
        parts.append({"type": "text", "text": text})
    elif has_image:
        parts.append({
            "type": "text",
            "text": "请根据上传的图片理解需求，并生成或修改当前 CAD 方案。",
        })

    return parts


async def _render_cadquery_file(websocket: WebSocket, conversation_id: str, cad_file: Path) -> dict:
    code = cad_file.read_text()
    await websocket.send_json({
        "type": "agent_code",
        "payload": {"code": code, "path": str(cad_file), "conversation_id": conversation_id},
    })
    await _send_status(websocket, conversation_id, "render", "渲染 cadquery.py")
    await websocket.send_json({
        "type": "agent_cad_executing",
        "payload": {"conversation_id": conversation_id},
    })

    result = await asyncio.to_thread(execute_cadquery, code)

    if result.get("success"):
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
            "error": result.get("error", "CAD 执行失败"),
            "conversation_id": conversation_id,
        },
    })
    return result
