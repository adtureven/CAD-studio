from abc import ABC, abstractmethod
from typing import AsyncIterator
from dataclasses import dataclass


@dataclass
class StreamChunk:
    type: str  # "thinking" | "content" | "done" | "error"
    content: str = ""
    usage: dict | None = None


@dataclass
class AIRequest:
    system_prompt: str
    messages: list[dict]
    model: str
    enable_thinking: bool = True
    max_tokens: int = 16000
    temperature: float = 0.0
    images: list[bytes] | None = None
    reasoning_effort: str = "low"


class AbstractAIProvider(ABC):
    @abstractmethod
    async def stream_generate(self, request: AIRequest) -> AsyncIterator[StreamChunk]:
        ...

    @abstractmethod
    async def generate(self, request: AIRequest) -> str:
        ...

    @abstractmethod
    def supports_model(self, model: str) -> bool:
        ...

    @abstractmethod
    def supports_vision(self) -> bool:
        ...

    @abstractmethod
    def list_models(self) -> list[dict]:
        ...
