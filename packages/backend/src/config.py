from pydantic_settings import BaseSettings
from pathlib import Path

# Project root .env (single source of truth, shared with scripts/opencode.sh).
ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    gateway_url: str = ""
    gateway_api_key: str = ""
    gateway_models: str = ""

    agent_base_url: str = ""
    default_model: str = ""

    # Agent mode powered by opencode. When disabled, fall back to the legacy
    # in-process anthropic loop.
    opencode_enabled: bool = True
    opencode_base_url: str = "http://127.0.0.1:4096"
    opencode_provider_id: str = "cadgw"
    opencode_provider_base_url: str = ""
    opencode_server_password: str = ""
    # When the backend runs in Docker but opencode runs on the host, the
    # session directory paths differ. Set this to the host-side absolute path
    # of generated/agent_sessions so the backend can hand opencode a path it
    # can actually resolve. Empty = no translation (backend and opencode share
    # the same filesystem).
    opencode_host_root: str = ""

    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    database_url: str = "sqlite+aiosqlite:///./cad_studio.db"

    generated_dir: Path = Path("generated")
    max_execution_time: int = 30
    max_memory_mb: int = 512

    model_config = {
        "env_file": str(ENV_FILE),
        "extra": "ignore",
    }


settings = Settings()


def _first_gateway_model(value: str) -> str:
    return next((item.strip() for item in value.split(",") if item.strip()), "")


if not settings.agent_base_url:
    settings.agent_base_url = settings.gateway_url or "https://token-plan-sgp.xiaomimimo.com/v1"
if not settings.default_model:
    settings.default_model = _first_gateway_model(settings.gateway_models) or "mimo-v2.5-pro"

settings.generated_dir.mkdir(parents=True, exist_ok=True)
