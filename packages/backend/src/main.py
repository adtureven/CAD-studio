import mimetypes

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import settings
from .api.router import api_router

mimetypes.add_type("application/step", ".step")
mimetypes.add_type("application/step", ".stp")

app = FastAPI(title="CAD AI Studio", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/assets", StaticFiles(directory=str(settings.generated_dir)), name="assets")
app.include_router(api_router, prefix="/api")
