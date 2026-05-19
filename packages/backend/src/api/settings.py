from fastapi import APIRouter
from pydantic import BaseModel

from ..config import settings

router = APIRouter()


class SettingsResponse(BaseModel):
    gateway_url: str
    gateway_api_key: str
    gateway_models: str


class SettingsUpdate(BaseModel):
    gateway_url: str | None = None
    gateway_api_key: str | None = None
    gateway_models: str | None = None


@router.get("/settings", response_model=SettingsResponse)
async def get_settings():
    return SettingsResponse(
        gateway_url=settings.gateway_url,
        gateway_api_key=_mask_key(settings.gateway_api_key),
        gateway_models=settings.gateway_models,
    )


@router.put("/settings", response_model=SettingsResponse)
async def update_settings(body: SettingsUpdate):
    if body.gateway_url is not None:
        settings.gateway_url = body.gateway_url
    if body.gateway_api_key is not None and not body.gateway_api_key.startswith("***"):
        settings.gateway_api_key = body.gateway_api_key
    if body.gateway_models is not None:
        settings.gateway_models = body.gateway_models

    return SettingsResponse(
        gateway_url=settings.gateway_url,
        gateway_api_key=_mask_key(settings.gateway_api_key),
        gateway_models=settings.gateway_models,
    )


def _mask_key(key: str) -> str:
    if not key or len(key) <= 8:
        return "***"
    return key[:4] + "***" + key[-4:]
