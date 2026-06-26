from typing import AsyncIterator

import openai

from .base import AbstractAIProvider, AIRequest, StreamChunk, split_image_data


class OpenAIProvider(AbstractAIProvider):
    SUPPORTED_MODELS = {
        "gpt-4o": "gpt-4o",
        "gpt-4o-mini": "gpt-4o-mini",
        "o1": "o1",
    }

    def __init__(self, api_key: str):
        self.client = openai.AsyncOpenAI(api_key=api_key)

    def supports_model(self, model: str) -> bool:
        return model in self.SUPPORTED_MODELS

    def supports_vision(self) -> bool:
        return True

    def list_models(self) -> list[dict]:
        return [
            {"id": k, "name": k, "provider": "openai"}
            for k in self.SUPPORTED_MODELS
        ]

    async def stream_generate(self, request: AIRequest) -> AsyncIterator[StreamChunk]:
        messages = self._build_messages(request)

        stream = await self.client.chat.completions.create(
            model=self.SUPPORTED_MODELS.get(request.model, request.model),
            messages=messages,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            stream=True,
        )

        async for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            if not delta:
                continue
            if delta.content:
                yield StreamChunk(type="content", content=delta.content)

        yield StreamChunk(type="done")

    async def generate(self, request: AIRequest) -> str:
        messages = self._build_messages(request)

        response = await self.client.chat.completions.create(
            model=self.SUPPORTED_MODELS.get(request.model, request.model),
            messages=messages,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
        )

        return response.choices[0].message.content or ""

    def _build_messages(self, request: AIRequest) -> list[dict]:
        messages = [{"role": "system", "content": request.system_prompt}]

        for msg in request.messages:
            content = []
            if msg.get("images"):
                for image in msg["images"]:
                    mime, data = split_image_data(image)
                    content.append({
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime};base64,{data}"},
                    })
            content.append({"type": "text", "text": msg["content"]})
            messages.append({"role": msg["role"], "content": content})

        return messages
