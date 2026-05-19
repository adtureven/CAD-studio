from typing import AsyncIterator

import anthropic

from .base import AbstractAIProvider, AIRequest, StreamChunk


class ClaudeProvider(AbstractAIProvider):
    SUPPORTED_MODELS = {
        "claude-opus-4-5": "claude-opus-4-5-20250415",
        "claude-sonnet-4-5": "claude-sonnet-4-5-20250514",
        "claude-haiku-3.5": "claude-3-5-haiku-20241022",
    }

    def __init__(self, api_key: str):
        self.client = anthropic.AsyncAnthropic(api_key=api_key)

    def supports_model(self, model: str) -> bool:
        return model in self.SUPPORTED_MODELS

    def supports_vision(self) -> bool:
        return True

    def list_models(self) -> list[dict]:
        return [
            {"id": k, "name": k, "provider": "anthropic"}
            for k in self.SUPPORTED_MODELS
        ]

    async def stream_generate(self, request: AIRequest) -> AsyncIterator[StreamChunk]:
        messages = self._build_messages(request)

        kwargs = {
            "model": self.SUPPORTED_MODELS.get(request.model, request.model),
            "max_tokens": request.max_tokens,
            "system": request.system_prompt,
            "messages": messages,
        }

        if request.enable_thinking:
            kwargs["thinking"] = {"type": "enabled", "budget_tokens": 8000}

        async with self.client.messages.stream(**kwargs) as stream:
            async for event in stream:
                if event.type == "content_block_delta":
                    if hasattr(event.delta, "thinking"):
                        yield StreamChunk(type="thinking", content=event.delta.thinking)
                    elif hasattr(event.delta, "text"):
                        yield StreamChunk(type="content", content=event.delta.text)

            final_message = await stream.get_final_message()
            yield StreamChunk(
                type="done",
                usage={
                    "input_tokens": final_message.usage.input_tokens,
                    "output_tokens": final_message.usage.output_tokens,
                },
            )

    async def generate(self, request: AIRequest) -> str:
        messages = self._build_messages(request)

        response = await self.client.messages.create(
            model=self.SUPPORTED_MODELS.get(request.model, request.model),
            max_tokens=request.max_tokens,
            system=request.system_prompt,
            messages=messages,
        )

        return response.content[0].text

    def _build_messages(self, request: AIRequest) -> list[dict]:
        messages = []
        for msg in request.messages:
            content = []
            if msg.get("images"):
                for img_b64 in msg["images"]:
                    content.append({
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": img_b64,
                        },
                    })
            content.append({"type": "text", "text": msg["content"]})
            messages.append({"role": msg["role"], "content": content})
        return messages
