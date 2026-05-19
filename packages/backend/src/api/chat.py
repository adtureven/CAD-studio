import json
import re
from pathlib import Path

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..services.ai.base import AIRequest, StreamChunk
from ..services.ai.router import ai_router
from ..services.cad.executor import execute_cadquery

router = APIRouter()

SYSTEM_PROMPT_PATH = Path(__file__).parent.parent / "services" / "ai" / "prompts" / "system_cad.md"
SYSTEM_PROMPT = SYSTEM_PROMPT_PATH.read_text()


def extract_code_from_response(text: str) -> str | None:
    pattern = r"```(?:python|py|Python)?\s*\n(.*?)```"
    match = re.search(pattern, text, re.DOTALL)
    if not match:
        return None
    code = match.group(1).strip()
    if "import cadquery" in code or "cq." in code:
        return code
    return None


@router.websocket("/ws")
async def chat_websocket(websocket: WebSocket):
    await websocket.accept()

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "chat_request":
                await handle_chat_request(websocket, data.get("payload", {}))
            elif msg_type == "param_update":
                await handle_param_update(websocket, data.get("payload", {}))

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({
                "type": "error",
                "payload": {"message": str(e)},
            })
        except Exception:
            pass


MAX_FIX_ATTEMPTS = 2

FIX_PROMPT = """The CadQuery code you generated failed to execute with this error:

```
{error}
```

Original code:
```python
{code}
```

Please fix the code. Common issues:
- Duplicate/overlapping points in polyline (causes zero-length edges)
- Invalid fillet/chamfer radius (too large for geometry)
- Operations on empty selections
- Use simpler geometry approaches when possible (e.g. circle + extrude for gear approximation instead of complex polyline profiles)

Return ONLY the corrected code in a ```python block."""


async def handle_chat_request(websocket: WebSocket, payload: dict):
    conversation_id = payload.get("conversation_id", "default")
    message = payload.get("message", "")
    images = payload.get("images", [])
    model = payload.get("model", "mimo-v2.5-pro")
    enable_thinking = payload.get("enable_thinking", True)
    history = payload.get("history", [])

    messages = history + [{"role": "user", "content": message, "images": images or None}]

    request = AIRequest(
        system_prompt=SYSTEM_PROMPT,
        messages=messages,
        model=model,
        enable_thinking=enable_thinking,
    )

    try:
        provider = ai_router.get_provider(model)
    except ValueError as e:
        await websocket.send_json({
            "type": "error",
            "payload": {"message": str(e), "conversation_id": conversation_id},
        })
        return

    full_response = ""

    try:
        async for chunk in provider.stream_generate(request):
            if chunk.type == "thinking":
                await websocket.send_json({
                    "type": "thinking_chunk",
                    "payload": {"content": chunk.content, "conversation_id": conversation_id},
                })
            elif chunk.type == "content":
                full_response += chunk.content
                await websocket.send_json({
                    "type": "response_chunk",
                    "payload": {"content": chunk.content, "conversation_id": conversation_id},
                })
            elif chunk.type == "done":
                code = extract_code_from_response(full_response)

                if code:
                    await websocket.send_json({
                        "type": "code_generated",
                        "payload": {"code": code, "conversation_id": conversation_id},
                    })

                    await websocket.send_json({
                        "type": "cad_executing",
                        "payload": {"conversation_id": conversation_id},
                    })

                    result = execute_cadquery(code)

                    if not result["success"]:
                        result = await _try_fix_code(
                            provider, model, code, result["error"],
                            websocket, conversation_id, enable_thinking
                        )

                    if result["success"]:
                        await websocket.send_json({
                            "type": "cad_result",
                            "payload": {
                                "model_url": result["model_url"],
                                "format": result.get("format", "gltf"),
                                "parameters": result.get("parameters", []),
                                "conversation_id": conversation_id,
                            },
                        })
                    else:
                        await websocket.send_json({
                            "type": "cad_error",
                            "payload": {
                                "error": result["error"],
                                "conversation_id": conversation_id,
                            },
                        })

                await websocket.send_json({
                    "type": "done",
                    "payload": {
                        "conversation_id": conversation_id,
                        "usage": chunk.usage,
                    },
                })

    except Exception as e:
        await websocket.send_json({
            "type": "error",
            "payload": {"message": str(e), "conversation_id": conversation_id},
        })


async def _try_fix_code(provider, model, code, error, websocket, conversation_id, enable_thinking):
    for attempt in range(MAX_FIX_ATTEMPTS):
        await websocket.send_json({
            "type": "response_chunk",
            "payload": {
                "content": f"\n\n> Code execution failed, auto-fixing (attempt {attempt + 1})...\n",
                "conversation_id": conversation_id,
            },
        })

        fix_request = AIRequest(
            system_prompt=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": FIX_PROMPT.format(error=error, code=code)}],
            model=model,
            enable_thinking=enable_thinking,
            max_tokens=8000,
        )

        fix_response = ""
        async for chunk in provider.stream_generate(fix_request):
            if chunk.type == "content":
                fix_response += chunk.content

        fixed_code = extract_code_from_response(fix_response)
        if not fixed_code:
            continue

        await websocket.send_json({
            "type": "code_generated",
            "payload": {"code": fixed_code, "conversation_id": conversation_id},
        })

        result = execute_cadquery(fixed_code)
        if result["success"]:
            return result

        code = fixed_code
        error = result["error"]

    return {"success": False, "error": f"Failed after {MAX_FIX_ATTEMPTS} fix attempts: {error}"}


async def handle_param_update(websocket: WebSocket, payload: dict):
    code = payload.get("code", "")
    parameters = payload.get("parameters", {})
    conversation_id = payload.get("conversation_id", "default")

    await websocket.send_json({
        "type": "cad_executing",
        "payload": {"conversation_id": conversation_id},
    })

    result = execute_cadquery(code, parameters)

    if result["success"]:
        await websocket.send_json({
            "type": "cad_result",
            "payload": {
                "model_url": result["model_url"],
                "format": result.get("format", "gltf"),
                "parameters": result.get("parameters", []),
                "conversation_id": conversation_id,
            },
        })
    else:
        await websocket.send_json({
            "type": "cad_error",
            "payload": {
                "error": result["error"],
                "conversation_id": conversation_id,
            },
        })


@router.get("/models")
async def list_models():
    return {"models": ai_router.list_available_models()}
