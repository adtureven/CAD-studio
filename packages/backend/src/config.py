from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    gateway_url: str = ""
    gateway_api_key: str = ""
    gateway_models: str = ""

    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    database_url: str = "sqlite+aiosqlite:///./cad_studio.db"

    generated_dir: Path = Path("generated")
    max_execution_time: int = 30
    max_memory_mb: int = 512

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
settings.generated_dir.mkdir(parents=True, exist_ok=True)
