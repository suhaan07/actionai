"""Qloo hackathon API client. Every call is cached; responses are slimmed before use."""
import asyncio
import logging
from urllib.parse import urlencode

import httpx

from . import cache, config

log = logging.getLogger("qloo")

_client = httpx.AsyncClient(base_url=config.QLOO_BASE_URL, headers={"X-Api-Key": config.QLOO_API_KEY}, timeout=60)
_sem = asyncio.Semaphore(4)

ENTITY_TYPES = ["artist", "movie", "tv_show", "brand", "person", "place", "book", "podcast", "video_game", "destination"]

# Properties worth keeping; Qloo returns a lot more (akas etc.) that we drop.
_KEEP = ("description", "short_description", "primary_genres", "secondary_genres", "known_for", "characteristics", "lyrical_themes", "release_year", "image")


class QlooError(Exception):
    pass


def call_string(path: str, params: dict) -> str:
    """Request line shown in the evidence panel (never includes the key)."""
    return f"GET {path}?{urlencode(params, safe=':,')}"


async def _get(path: str, params: dict):
    key = cache.key_for("qloo", path, params)
    hit = await cache.get(key)
    if hit is not None:
        return hit
    async with _sem:
        for attempt in range(5):
            try:
                r = await _client.get(path, params=params)
            except httpx.HTTPError as e:
                if attempt == 4:
                    raise QlooError(str(e)) from e
                await asyncio.sleep(1 + attempt)
                continue
            if r.status_code in (429, 500, 502, 503, 504) and attempt < 4:
                ra = r.headers.get("retry-after")
                await asyncio.sleep(float(ra) if ra and ra.replace(".", "").isdigit() else 1.5 * 2 ** attempt)
                continue
            if r.status_code != 200:
                log.warning("qloo %s %s -> %s %s", path, params, r.status_code, r.text[:200])
                if r.status_code in (400, 404):
                    await cache.put(key, [])  # "no data" is a stable answer; don't spend quota re-asking
                return None
            data = r.json()
            break
    slim = _slim(path, params, data)
    await cache.put(key, slim)
    return slim


def _slim_entity(e: dict) -> dict:
    props = e.get("properties") or {}
    out = {
        "id": e.get("entity_id"),
        "name": e.get("name"),
        "type": e.get("subtype") or (e.get("types") or [e.get("type")])[0],
        "popularity": e.get("popularity"),
        "affinity": (e.get("query") or {}).get("affinity"),
    }
    for k in _KEEP:
        if k in props:
            v = props[k]
            out[k] = v.get("url") if k == "image" and isinstance(v, dict) else v
    loc = e.get("location") or props.get("geocode")
    if isinstance(loc, dict) and "lat" in loc:
        out["lat"], out["lon"] = loc.get("lat"), loc.get("lon")
    for k in ("country", "state", "city"):
        if isinstance(props.get(k), str):
            out[k] = props[k]
    tags = e.get("tags")
    if tags:
        keep = [t for t in tags[:12]] + [t for t in tags[12:] if "occupation" in (t.get("tag_id") or t.get("id") or "")]
        out["tags"] = [{"id": t.get("tag_id") or t.get("id"), "name": t.get("name")} for t in keep]
    return out


def _slim(path: str, params: dict, data: dict):
    res = data.get("results")
    if path == "/search":
        return [_slim_entity(e) for e in (res or [])[:8]]
    if not isinstance(res, dict):
        return []
    if "heatmap" in res:
        return [[round(c["location"]["latitude"], 3), round(c["location"]["longitude"], 3), round(c["query"]["affinity"], 3)] for c in res["heatmap"]]
    if "tags" in res:
        return [
            {"id": t.get("id") or t.get("tag_id"), "name": t.get("name"), "type": t.get("type") or t.get("subtype"), "affinity": (t.get("query") or {}).get("affinity")}
            for t in res["tags"]
        ]
    if "entities" in res:
        return [_slim_entity(e) for e in res["entities"]]
    if "demographics" in res:
        return res["demographics"]
    return []


# ── public calls ─────────────────────────────────────────

async def search(query: str, types: str | None = None, take: int = 5) -> list[dict]:
    p = {"query": query, "take": take}
    if types:
        p["types"] = types
    return (await _get("/search", p)) or []


async def tags(query: str, take: int = 8, tag_types: str | None = None) -> list[dict]:
    p = {"filter.query": query, "take": take}
    if tag_types:
        p["filter.tag.types"] = tag_types
    return (await _get("/v2/tags", p)) or []


async def insights(params: dict) -> list[dict]:
    return (await _get("/v2/insights", params)) or []


async def heatmap(signal: dict, scope: dict | None = None) -> list[list[float]]:
    """Heatmap cells [lat, lon, affinity] for an entity or tag signal over an area (a country, or the world)."""
    return (await _get("/v2/insights", {"filter.type": "urn:heatmap", **(scope or {"filter.location.query": "India"}), **signal})) or []


def heat_params(sig: dict) -> dict:
    return {"signal.interests.tags": sig["id"]} if sig["kind"] == "tag" else {"signal.interests.entities": sig["id"]}


AGE_BANDS = ["24_and_younger", "25_to_29", "30_to_34", "35_to_44", "45_to_54", "55_and_older"]


def age_param(audience: str | None) -> str | None:
    """'22–35' → '25_to_29,30_to_34' style bucket list Qloo accepts."""
    if not audience:
        return None
    a = audience.replace("–", "-").replace("+", "-99")
    try:
        lo, hi = (int(x) for x in a.split("-")[:2])
    except ValueError:
        return None
    spans = {"24_and_younger": (0, 24), "25_to_29": (25, 29), "30_to_34": (30, 34), "35_to_44": (35, 44), "45_to_54": (45, 54), "55_and_older": (55, 120)}
    hit = [b for b, (a0, a1) in spans.items() if a0 <= hi and a1 >= lo]
    return ",".join(hit) or None
