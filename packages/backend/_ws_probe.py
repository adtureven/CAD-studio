import asyncio
import json
import sys

import websockets


async def main():
    uri = "ws://127.0.0.1:8002/api/agent/ws"
    seen_types = {}
    text_chunks = 0
    async with websockets.connect(uri, max_size=None) as ws:
        await ws.send(json.dumps({
            "type": "agent_request",
            "payload": {
                "conversation_id": "probe-stream-1",
                "message": "做一个 40x40x40 的立方体，并在顶面中心切一个直径 10 的通孔",
                "model": "mimo-v2.5-pro",
            },
        }))

        while True:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=120)
            except asyncio.TimeoutError:
                print("TIMEOUT waiting for events")
                break
            msg = json.loads(raw)
            t = msg.get("type")
            seen_types[t] = seen_types.get(t, 0) + 1
            if t == "agent_text_delta":
                text_chunks += 1
                sys.stdout.write(msg["payload"].get("text", ""))
                sys.stdout.flush()
            elif t == "agent_tool_use":
                print(f"\n[TOOL_USE] {msg['payload'].get('name')}")
            elif t == "agent_tool_result":
                out = str(msg["payload"].get("output", ""))[:120]
                print(f"[TOOL_RESULT err={msg['payload'].get('is_error')}] {out}")
            elif t == "agent_cad_result":
                print(f"\n[CAD_RESULT] url={msg['payload'].get('model_url')} params={len(msg['payload'].get('parameters', []))}")
            elif t == "agent_cad_error":
                print(f"\n[CAD_ERROR] {msg['payload'].get('error')}")
            elif t == "agent_repair_start":
                print(f"\n[REPAIR] {msg['payload'].get('attempt')}/{msg['payload'].get('max_attempts')}")
            elif t == "agent_done":
                print(f"\n[DONE] code={msg['payload'].get('return_code')}")
                break
            elif t == "agent_error":
                print(f"\n[ERROR] {msg['payload'].get('message')}")
                break

    print("\n\n=== EVENT SUMMARY ===")
    for k, v in seen_types.items():
        print(f"  {k}: {v}")
    print(f"  text_chunks streamed: {text_chunks}")


asyncio.run(main())
