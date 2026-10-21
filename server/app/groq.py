"""Groq client (open-weight models) for short text-only JSON tasks. OpenAI-compatible chat API over httpx."""
import asyncio
import json
import logging
from typing import TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from . import config

log = logging.getLogger("groq")
T = TypeVar("T", bound=BaseModel)

enabled = bool(config.GROQ_API_KEY)
_client = httpx.AsyncClient(
    base_url="https://api.groq.com/openai/v1",
    headers={"Authorization": f"Bearer {config.GROQ_API_KEY}"},
    timeout=60,
)


class GroqBusy(Exception):
    """Rate-limited or unavailable: the caller should fall back to Gemini."""


async def json_call(schema: type[T], system: str, text: str, temperature: float = 0.4) -> T:
    if not enabled:
        raise GroqBusy("no key")
    instructions = (
        f"{system}\n\nReply with a single JSON object that matches this JSON Schema exactly. No prose, no code fences.\n"
        f"{json.dumps(schema.model_json_schema())}"
    )
    last: Exception | None = None
    # The free tier caps tokens per minute (8K on the 120B model), counting the prompt plus the answer allowance, so a big
    # prompt with a fixed 4K allowance is refused outright. Size the allowance to fit.
    prompt_tokens = (len(instructions) + len(text)) // 3
    allowance = max(1500, min(4096, 7600 - prompt_tokens))
    for model in config.GROQ_MODELS:
        body = {
            "model": model,
            "messages": [{"role": "system", "content": instructions}, {"role": "user", "content": text}],
            "temperature": temperature,
            "response_format": {"type": "json_object"},
            "max_completion_tokens": allowance,
        }
        if model.startswith("openai/gpt-oss"):
            body["reasoning_effort"] = "low"  # fewer tokens against the per-minute limit
        for attempt in range(2):
            try:
                r = await _client.post("/chat/completions", json=body)
            except httpx.HTTPError as e:
                last = e
                await asyncio.sleep(1)
                continue
            if r.status_code in (429, 503, 498):
                left = r.headers.get("x-ratelimit-remaining-tokens"), r.headers.get("x-ratelimit-remaining-requests")
                log.warning("groq %s busy (%s, remaining tokens/requests %s, prompt ~%s + allowance %s): %s", model, r.status_code, left, prompt_tokens, allowance, r.text[:160])
                last = GroqBusy(r.text[:200])
                break  # try the next model
            if r.status_code != 200:
                last = GroqBusy(f"{r.status_code} {r.text[:200]}")
                log.warning("groq %s error %s %s", model, r.status_code, r.text[:200])
                break
            content = r.json()["choices"][0]["message"].get("content") or "{}"
            try:
                return schema.model_validate_json(content)
            except ValidationError as e:
                last = e
                body["messages"] = body["messages"] + [
                    {"role": "assistant", "content": content},
                    {"role": "user", "content": f"That JSON did not match the schema: {str(e)[:400]}. Reply again with corrected JSON only."},
                ]
    raise GroqBusy(str(last))
