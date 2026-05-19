from pydantic import BaseModel
from typing import Optional


class ChatMessage(BaseModel):
    role: str
    content: str
    images: Optional[list[str]] = None


class ChatRequest(BaseModel):
    conversation_id: str
    message: str
    images: Optional[list[str]] = None
    model: str = "claude-sonnet-4-5"
    enable_thinking: bool = True
    history: list[ChatMessage] = []


class ChatResponse(BaseModel):
    conversation_id: str
    content: str
    thinking: Optional[str] = None
    code: Optional[str] = None
    model_url: Optional[str] = None
    parameters: list[dict] = []
