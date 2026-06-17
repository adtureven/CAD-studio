import logging
import mimetypes

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import settings
from .api.router import api_router

logger = logging.getLogger(__name__)

mimetypes.add_type("application/step", ".step")
mimetypes.add_type("application/step", ".stp")

app = FastAPI(title="CAD AI Studio", version="0.1.0")


@app.on_event("startup")
async def _provision_opencode():
    if not settings.opencode_enabled:
        return
    from .services.opencode import client as opencode_client

    # The opencode.json (provider + permissions) is generated and owned by
    # scripts/opencode.sh, since opencode reads its config at server startup
    # via OPENCODE_CONFIG — the backend only verifies the server is reachable.
    try:
        await opencode_client.health()
    except Exception:
        logger.warning(
            "opencode 服务未就绪（%s）。Agent 模式需先运行 scripts/opencode.sh。",
            settings.opencode_base_url,
        )

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/assets", StaticFiles(directory=str(settings.generated_dir)), name="assets")
app.include_router(api_router, prefix="/api")
