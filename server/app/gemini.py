"""Gemini helper: structured JSON out, optional media in.

Free-tier quotas are per model and per minute, so on a 429/503 we move to the next model in the chain
before waiting. Enable billing in Google AI Studio for production traffic.
"""
import asyncio
import io
import logging
import re
import time
from typing import TypeVar

from google import genai
from google.genai import types
from pydantic import BaseModel

from . import cache, config, groq

log = logging.getLogger("gemini")
client = genai.Client(api_key=config.GEMINI_API_KEY)

T = TypeVar("T", bound=BaseModel)

INLINE_LIMIT = 18 * 1024 * 1024
CALL_TIMEOUT = 75  # seconds per model attempt; a stuck call moves on to the next model
MODELS = [config.GEMINI_MODEL] + [m for m in config.GEMINI_FALLBACKS if m != config.GEMINI_MODEL]


class GeminiError(Exception):
    pass


async def media_part(data: bytes, mime: str) -> types.Part:
    """Small files go inline; large videos go through the Files API."""
    if len(data) <= INLINE_LIMIT:
        return types.Part.from_bytes(data=data, mime_type=mime)
    f = await client.aio.files.upload(file=io.BytesIO(data), config=types.UploadFileConfig(mime_type=mime))
    for _ in range(60):
        if f.state and f.state.name == "ACTIVE":
            break
        await asyncio.sleep(2)
        f = await client.aio.files.get(name=f.name)
    return types.Part.from_uri(file_uri=f.uri, mime_type=mime)


def _busy(e: Exception) -> float | None:
    """Seconds to wait if this is a rate-limit/overload error, else None."""
    s = str(e)
    if isinstance(e, asyncio.TimeoutError):
        return 2.0
    if "429" in s or "RESOURCE_EXHAUSTED" in s or "503" in s or "UNAVAILABLE" in s:
        m = re.search(r"retryDelay'?:\s*'?(\d+)", s)
        return float(m.group(1)) if m else 4.0
    return None


async def json_call(schema: type[T], system: str, parts: list, temperature: float = 0.4, model: str | None = None, prefer: str = "gemini") -> T:
    """prefer="groq" sends text-only work to Groq first and falls back to Gemini (and vice versa)."""
    cfg = types.GenerateContentConfig(
        system_instruction=system,
        response_mime_type="application/json",
        response_schema=schema,
        temperature=temperature,
    )
    # Identical text-only requests reuse the saved answer, so retries and repeat views cost no quota.
    ckey = cache.key_for("gemini", schema.__name__, schema.model_json_schema(), system, parts) if all(isinstance(p, str) for p in parts) else None
    if ckey:
        hit = await cache.get(ckey)
        if hit is not None:
            return schema.model_validate(hit)
    text_only = all(isinstance(p, str) for p in parts)
    joined = "\n\n".join(p for p in parts if isinstance(p, str))
    if prefer == "groq" and text_only and groq.enabled:
        try:
            result = await groq.json_call(schema, system, joined, temperature)
        except groq.GroqBusy as e:
            log.warning("groq unavailable, using gemini: %s", str(e)[:120])
            result = await _call(schema, cfg, parts, model)
    else:
        try:
            result = await _call(schema, cfg, parts, model)
        except GeminiError:
            if not (text_only and groq.enabled):
                raise
            log.warning("gemini unavailable, using groq")
            try:
                result = await groq.json_call(schema, system, joined, temperature)
            except groq.GroqBusy as e:
                raise GeminiError(f"both providers are busy: {e}") from e
    if ckey:
        await cache.put(ckey, result.model_dump())
    return result


async def _call(schema: type[T], cfg: types.GenerateContentConfig, parts: list, model: str | None) -> T:
    chain = [model] if model else MODELS
    last: Exception | None = None
    started = time.monotonic()
    for round_ in range(2):
        waits = []
        for m in chain:
            try:
                r = await asyncio.wait_for(client.aio.models.generate_content(model=m, contents=parts, config=cfg), CALL_TIMEOUT)
                if r.parsed is not None:
                    return r.parsed  # type: ignore[return-value]
                return schema.model_validate_json(r.text or "{}")
            except Exception as e:
                last = e
                wait = _busy(e)
                log.warning("gemini %s failed (round %s): %s", m, round_ + 1, str(e)[:160])
                if wait is None:
                    # Not a capacity problem (bad output, bad request): one quick retry on the same model.
                    try:
                        r = await asyncio.wait_for(client.aio.models.generate_content(model=m, contents=parts, config=cfg), CALL_TIMEOUT)
                        return r.parsed if r.parsed is not None else schema.model_validate_json(r.text or "{}")  # type: ignore[return-value]
                    except Exception as e2:
                        last = e2
                    continue
                waits.append(wait)
        if round_ == 0 and waits:
            if time.monotonic() - started > 150:
                break  # don't keep the user waiting more than ~2.5 minutes
            await asyncio.sleep(min(min(waits), 20))
    raise GeminiError(str(last))
