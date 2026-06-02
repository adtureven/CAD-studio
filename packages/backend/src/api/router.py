from fastapi import APIRouter

from .health import router as health_router
from .cad import router as cad_router
from .chat import router as chat_router
from .agent import router as agent_router
from .settings import router as settings_router

api_router = APIRouter()
api_router.include_router(health_router, tags=["health"])
api_router.include_router(cad_router, prefix="/cad", tags=["cad"])
api_router.include_router(chat_router, prefix="/chat", tags=["chat"])
api_router.include_router(agent_router, prefix="/agent", tags=["agent"])
api_router.include_router(settings_router, tags=["settings"])
