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


# Models that just refused for capacity: skipped until this time, so we stop burning seconds on them.
# A spent daily quota benches the model for an hour; a per-minute limit or overload for a minute.
_benched: dict[str, float] = {}


def _bench(model: str, e: Exception) -> None:
    s = str(e)
    if "PerDay" in s:
        _benched[model] = time.monotonic() + 3600
    elif _busy(e) is not None:
        _benched[model] = time.monotonic() + 60


def _available(chain: list[str]) -> list[str]:
    now = time.monotonic()
    return [m for m in chain if _benched.get(m, 0) <= now]


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
    """Structured JSON from the best available model.

    Text-only work: one attempt on the first available Gemini model, and on any error straight to Groq; only if Groq
    also fails, the remaining Gemini models. prefer="groq" starts with Groq. Work with images, video or audio needs
    Gemini, so it walks the Gemini models only.
    """
    cfg = types.GenerateContentConfig(
        system_instruction=system,
        response_mime_type="application/json",
        response_schema=schema,
        temperature=temperature,
    )
    text_only = all(isinstance(p, str) for p in parts)
    # Identical text-only requests reuse the saved answer, so retries and repeat views cost no quota.
    ckey = cache.key_for("gemini", schema.__name__, schema.model_json_schema(), system, parts) if text_only else None
    if ckey:
        hit = await cache.get(ckey)
        if hit is not None:
            return schema.model_validate(hit)
    joined = "\n\n".join(p for p in parts if isinstance(p, str))
    chain = _available([model] if model else MODELS) or ([model] if model else MODELS)
    use_groq = text_only and groq.enabled

    result: T | None = None
    if use_groq and prefer == "groq":
        try:
            result = await groq.json_call(schema, system, joined, temperature)
        except groq.GroqBusy as e:
            log.warning("groq unavailable, using gemini: %s", str(e)[:120])
            result = await _call(schema, cfg, parts, chain)
    elif use_groq:
        try:
            result = await _call(schema, cfg, parts, chain[:1], quick=True)
        except GeminiError as e:
            log.warning("gemini %s failed, switching to groq: %s", chain[0], str(e)[:120])
            try:
                result = await groq.json_call(schema, system, joined, temperature)
            except groq.GroqBusy as ge:
                log.warning("groq also unavailable, trying the other gemini models: %s", str(ge)[:120])
                rest = _available(chain[1:])
                if not rest:
                    raise GeminiError(f"all models are busy: {ge}") from ge
                result = await _call(schema, cfg, parts, rest)
    else:
        result = await _call(schema, cfg, parts, chain)
    if ckey:
        await cache.put(ckey, result.model_dump())
    return result


async def _call(schema: type[T], cfg: types.GenerateContentConfig, parts: list, chain: list[str], quick: bool = False) -> T:
    """Try each model in turn. quick=True: one attempt each, no waiting (the caller has a fallback)."""
    last: Exception | None = None
    started = time.monotonic()
    for round_ in range(1 if quick else 2):
        waits = []
        for m in _available(chain) or (chain if round_ else []):
            try:
                r = await asyncio.wait_for(client.aio.models.generate_content(model=m, contents=parts, config=cfg), CALL_TIMEOUT)
                if r.parsed is not None:
                    return r.parsed  # type: ignore[return-value]
                return schema.model_validate_json(r.text or "{}")
            except Exception as e:
                last = e
                _bench(m, e)
                wait = _busy(e)
                log.warning("gemini %s failed (round %s): %s", m, round_ + 1, str(e)[:160])
                if wait is None and not quick:
                    # Not a capacity problem (bad output, bad request): one quick retry on the same model.
                    try:
                        r = await asyncio.wait_for(client.aio.models.generate_content(model=m, contents=parts, config=cfg), CALL_TIMEOUT)
                        return r.parsed if r.parsed is not None else schema.model_validate_json(r.text or "{}")  # type: ignore[return-value]
                    except Exception as e2:
                        last = e2
                    continue
                if wait is not None and "PerDay" not in str(e):
                    waits.append(wait)
        if round_ == 0 and waits and not quick:
            if time.monotonic() - started > 150:
                break  # don't keep the user waiting more than ~2.5 minutes
            await asyncio.sleep(min(min(waits), 20))
    raise GeminiError(str(last) if last else "no Gemini model available right now")
