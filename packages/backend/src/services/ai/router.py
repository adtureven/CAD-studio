from .base import AbstractAIProvider
from .claude_provider import ClaudeProvider
from .openai_provider import OpenAIProvider
from .gateway_provider import GatewayProvider
from ...config import settings


class AIModelRouter:
    def __init__(self):
        self.providers: list[AbstractAIProvider] = []
        self._init_providers()

    def _init_providers(self):
        if settings.gateway_url and settings.gateway_api_key:
            models = [m.strip() for m in settings.gateway_models.split(",") if m.strip()]
            if models:
                self.providers.append(
                    GatewayProvider(settings.gateway_url, settings.gateway_api_key, models)
                )
        if settings.anthropic_api_key:
            self.providers.append(ClaudeProvider(settings.anthropic_api_key))
        if settings.openai_api_key:
            self.providers.append(OpenAIProvider(settings.openai_api_key))

    def get_provider(self, model: str) -> AbstractAIProvider:
        for provider in self.providers:
            if provider.supports_model(model):
                return provider
        if self.providers:
            return self.providers[0]
        raise ValueError(f"No AI provider configured. Set API keys in .env")

    def list_available_models(self) -> list[dict]:
        models = []
        for provider in self.providers:
            models.extend(provider.list_models())
        return models


ai_router = AIModelRouter()
