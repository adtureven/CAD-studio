from fastapi import APIRouter
from pydantic import BaseModel

from ..config import settings, ENV_FILE
from ..services.ai import model_config
from ..services.ai.router import ai_router

router = APIRouter()

ENV_PATH = ENV_FILE


class SettingsResponse(BaseModel):
    gateway_url: str
    gateway_api_key: str
    gateway_models: str
    agent_base_url: str
    default_model: str


class SettingsUpdate(BaseModel):
    gateway_url: str | None = None
    gateway_api_key: str | None = None
    gateway_models: str | None = None
    agent_base_url: str | None = None
    default_model: str | None = None


@router.get("/settings", response_model=SettingsResponse)
async def get_settings():
    return _current()


@router.put("/settings", response_model=SettingsResponse)
async def update_settings(body: SettingsUpdate):
    changes: dict[str, str] = {}

    if body.gateway_url is not None:
        settings.gateway_url = body.gateway_url
        changes["GATEWAY_URL"] = body.gateway_url
    if body.gateway_api_key is not None and not body.gateway_api_key.startswith("***"):
        settings.gateway_api_key = body.gateway_api_key
        changes["GATEWAY_API_KEY"] = body.gateway_api_key
    if body.gateway_models is not None:
        settings.gateway_models = body.gateway_models
        changes["GATEWAY_MODELS"] = body.gateway_models
    if body.agent_base_url is not None:
        settings.agent_base_url = body.agent_base_url
        changes["AGENT_BASE_URL"] = body.agent_base_url
    if body.default_model is not None:
        settings.default_model = body.default_model
        changes["DEFAULT_MODEL"] = body.default_model

    if changes:
        _persist_env(changes)
    ai_router.reload()

    return _current()


def _current() -> SettingsResponse:
    return SettingsResponse(
        gateway_url=settings.gateway_url,
        gateway_api_key=_mask_key(settings.gateway_api_key),
        gateway_models=settings.gateway_models,
        agent_base_url=settings.agent_base_url,
        default_model=model_config.default_model_id(),
    )


def _mask_key(key: str) -> str:
    if not key or len(key) <= 8:
        return "***"
    return key[:4] + "***" + key[-4:]


def _persist_env(changes: dict[str, str]) -> None:
    """Write key=value pairs back to .env, updating existing keys in place."""
    lines = ENV_PATH.read_text().splitlines() if ENV_PATH.exists() else []
    remaining = dict(changes)

    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key = stripped.split("=", 1)[0].strip()
        if key in remaining:
            lines[i] = f"{key}={remaining.pop(key)}"

    for key, value in remaining.items():
        lines.append(f"{key}={value}")

    ENV_PATH.write_text("\n".join(lines) + "\n")
