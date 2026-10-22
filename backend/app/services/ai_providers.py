import json
import logging
import time
from typing import AsyncGenerator, Dict, Any, List, Optional
import httpx
from app.core.config import settings

logger = logging.getLogger("echomind.ai")

VERIFIED_OPEN_WEIGHT_MODELS = [
    {
        "id": "meta-llama/llama-3.1-8b-instruct",
        "name": "Llama 3.1 8B Instruct",
        "provider": "openrouter",
        "description": "Ultra-fast, state-of-the-art open-weight model with 128k context.",
        "is_open_weight": True,
        "context_length": 131072,
        "recommended": True
    },
    {
        "id": "meta-llama/llama-3.1-70b-instruct",
        "name": "Llama 3.1 70B Instruct",
        "provider": "openrouter",
        "description": "High-intelligence flagship open-weight model for complex technical synthesis.",
        "is_open_weight": True,
        "context_length": 131072,
        "recommended": False
    },
    {
        "id": "google/gemma-2-9b-it",
        "name": "Gemma 2 9B IT",
        "provider": "openrouter",
        "description": "Google's high-efficiency open-weight model engineered for precise answers.",
        "is_open_weight": True,
        "context_length": 8192,
        "recommended": False
    },
    {
        "id": "mistralai/mistral-7b-instruct",
        "name": "Mistral 7B Instruct v0.3",
        "provider": "openrouter",
        "description": "Fast and concise open-weight model optimal for quick answers.",
        "is_open_weight": True,
        "context_length": 32768,
        "recommended": False
    },
    {
        "id": "backboard/llama-3.1-8b",
        "name": "Backboard Llama 3.1 8B",
        "provider": "backboard",
        "description": "Hosted high-throughput open-weight instance on Backboard AI infrastructure.",
        "is_open_weight": True,
        "context_length": 65536,
        "recommended": False
    }
]


class BaseAIProvider:
    def __init__(self, api_key: str, api_base: str):
        self.api_key = api_key
        self.api_base = api_base.rstrip("/")

    async def generate_chat_completion(
        self,
        messages: List[Dict[str, str]],
        model: str,
        temperature: float = 0.3,
        max_tokens: int = 1000
    ) -> str:
        raise NotImplementedError

    async def stream_chat_completion(
        self,
        messages: List[Dict[str, str]],
        model: str,
        temperature: float = 0.3,
        max_tokens: int = 1000
    ) -> AsyncGenerator[str, None]:
        raise NotImplementedError


class OpenRouterProvider(BaseAIProvider):
    def __init__(self, api_key: Optional[str] = None):
        key = api_key if api_key is not None else settings.OPENROUTER_API_KEY
        super().__init__(key, settings.OPENROUTER_API_BASE)

    def _get_headers(self) -> Dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "HTTP-Referer": "https://echomind-ai.onrender.com",
            "X-Title": "EchoMind AI - Hacktoberfest 2026",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    async def generate_chat_completion(
        self,
        messages: List[Dict[str, str]],
        model: str = "meta-llama/llama-3.1-8b-instruct",
        temperature: float = 0.2,
        max_tokens: int = 1000,
        response_format: Optional[Dict[str, Any]] = None
    ) -> str:
        if not self.api_key:
            raise ValueError("OpenRouter API key is missing. Please configure OPENROUTER_API_KEY in Settings or .env.")

        payload: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if response_format:
            payload["response_format"] = response_format

        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(
                f"{self.api_base}/chat/completions",
                headers=self._get_headers(),
                json=payload
            )
            if resp.status_code != 200:
                logger.error(f"OpenRouter error: {resp.status_code} - {resp.text}")
                raise RuntimeError(f"OpenRouter API returned HTTP {resp.status_code}: {resp.text}")

            data = resp.json()
            return data["choices"][0]["message"]["content"]

    async def stream_chat_completion(
        self,
        messages: List[Dict[str, str]],
        model: str = "meta-llama/llama-3.1-8b-instruct",
        temperature: float = 0.2,
        max_tokens: int = 1500
    ) -> AsyncGenerator[str, None]:
        if not self.api_key:
            yield "⚠️ Configuration Notice: OpenRouter API key is missing. Please configure your OPENROUTER_API_KEY in Settings or your backend .env file to enable live AI responses."
            return

        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST",
                f"{self.api_base}/chat/completions",
                headers=self._get_headers(),
                json=payload
            ) as response:
                if response.status_code != 200:
                    error_body = await response.aread()
                    logger.error(f"OpenRouter streaming error {response.status_code}: {error_body.decode()}")
                    yield f"Error from OpenRouter (HTTP {response.status_code}): {error_body.decode()}"
                    return

                async for line in response.aiter_lines():
                    if not line:
                        continue
                    line = line.strip()
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str == "[DONE]":
                            break
                        try:
                            parsed = json.loads(data_str)
                            delta = parsed.get("choices", [{}])[0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                yield content
                        except Exception:
                            continue


class BackboardAIProvider(BaseAIProvider):
    def __init__(self, api_key: Optional[str] = None):
        key = api_key if api_key is not None else settings.BACKBOARD_API_KEY
        super().__init__(key, settings.BACKBOARD_API_BASE)

    def _get_headers(self) -> Dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "EchoMind-AI/1.0",
        }
        if self.api_key:
            headers["X-API-Key"] = self.api_key
        return headers

    def _format_content_and_system(self, messages: List[Dict[str, str]]) -> tuple[str, Optional[str]]:
        system_prompts = []
        user_parts = []
        for m in messages:
            role = m.get("role", "")
            content = m.get("content", "")
            if role == "system":
                system_prompts.append(content)
            elif role == "user":
                user_parts.append(content)
            elif role == "assistant":
                user_parts.append(f"[Assistant previously replied]: {content}")
        
        system_prompt = "\n\n".join(system_prompts) if system_prompts else None
        main_content = "\n\n".join(user_parts) if user_parts else (system_prompt or "Hello")
        return main_content, system_prompt

    async def generate_chat_completion(
        self,
        messages: List[Dict[str, str]],
        model: str = "meta-llama/llama-3.1-8b-instruct",
        temperature: float = 0.2,
        max_tokens: int = 1000
    ) -> str:
        if not self.api_key:
            raise ValueError("Backboard AI API key is missing. Please configure BACKBOARD_API_KEY in Settings or .env.")

        content, system_prompt = self._format_content_and_system(messages)
        payload: Dict[str, Any] = {
            "content": content,
            "stream": False,
        }
        if system_prompt:
            payload["system_prompt"] = system_prompt

        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(
                f"{self.api_base}/threads/messages",
                headers=self._get_headers(),
                json=payload
            )
            if resp.status_code != 200:
                logger.error(f"Backboard error: {resp.status_code} - {resp.text}")
                raise RuntimeError(f"Backboard API returned HTTP {resp.status_code}: {resp.text}")

            data = resp.json()
            return data.get("content", "")

    async def stream_chat_completion(
        self,
        messages: List[Dict[str, str]],
        model: str = "meta-llama/llama-3.1-8b-instruct",
        temperature: float = 0.2,
        max_tokens: int = 1500
    ) -> AsyncGenerator[str, None]:
        if not self.api_key:
            yield "⚠️ Configuration Notice: Backboard AI API key is missing. Please configure your BACKBOARD_API_KEY in Settings or your backend .env file to enable live Backboard AI streaming."
            return

        content, system_prompt = self._format_content_and_system(messages)
        payload: Dict[str, Any] = {
            "content": content,
            "stream": True,
        }
        if system_prompt:
            payload["system_prompt"] = system_prompt

        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST",
                f"{self.api_base}/threads/messages",
                headers=self._get_headers(),
                json=payload
            ) as response:
                if response.status_code != 200:
                    error_body = await response.aread()
                    logger.error(f"Backboard streaming error {response.status_code}: {error_body.decode()}")
                    yield f"Error from Backboard AI (HTTP {response.status_code}): {error_body.decode()}"
                    return

                async for line in response.aiter_lines():
                    if not line:
                        continue
                    line = line.strip()
                    if line.startswith("data: "):
                        data_str = line[6:].strip()
                        if not data_str:
                            continue
                        try:
                            parsed = json.loads(data_str)
                            event_type = parsed.get("type")
                            if event_type == "content_streaming":
                                chunk = parsed.get("content", "")
                                if chunk:
                                    yield chunk
                            elif event_type == "run_completed":
                                break
                            elif event_type == "run_failed":
                                yield f"\n[Backboard Error: {parsed.get('error', 'Execution failed')}]"
                                break
                        except Exception:
                            continue


def get_ai_provider(
    provider_name: Optional[str] = None,
    api_key: Optional[str] = None
) -> BaseAIProvider:
    provider = (provider_name or settings.AI_PROVIDER).lower()
    if provider == "backboard":
        return BackboardAIProvider(api_key=api_key)
    return OpenRouterProvider(api_key=api_key)
