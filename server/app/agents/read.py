"""Creative reader: Gemini extracts cultural cues; Qloo resolves and scores every one per region."""
import asyncio
import uuid
from typing import Literal, Optional

from pydantic import BaseModel, Field

from .. import gemini, qloo, regions

QlooType = Literal["artist", "movie", "tv_show", "brand", "person", "place", "book", "podcast", "video_game", "destination", "music_genre", "none"]


class Proxy(BaseModel):
    name: str = Field(description="A well-known named thing Qloo would know, e.g. a film, artist, brand or music genre")
    qloo_type: QlooType


class Cue(BaseModel):
    text: str = Field(description="The exact words from `text` that carry this cue, copied verbatim (needed for highlighting)")
    label: str = Field(description="Short name, e.g. 'Punjabi wedding sangeet'")
    role: str = Field(description="The cultural slot it fills, e.g. 'celebration', 'music', 'food moment', 'film reference', 'city life', 'sport', 'family value', 'festival', 'fashion'")
    source: Literal["script", "visual", "audio", "caption"]
    at: Optional[str] = Field(default=None, description="Timestamp range like '0:03–0:11' for video; null otherwise")
    prominence: Literal["hero", "support", "background"]
    kind: Literal["named", "concept"] = Field(description="'named' if it is a specific artist/film/brand/person/place; 'concept' otherwise")
    qloo_type: QlooType = Field(description="For named cues, the Qloo type. For music styles use music_genre. For other concepts use none")
    search: str = Field(description="What to search in Qloo: the exact name for named cues, a genre keyword for music_genre, else the concept")
    proxies: list[Proxy] = Field(default_factory=list, description="For concepts only: 1–3 widely known named things that embody this cue for Indian audiences")


class Extraction(BaseModel):
    name: str = Field(description="A short name for this creative")
    text: str = Field(description="The script, or for media a transcript plus short scene notes in plain prose. Every cue.text must appear in it verbatim")
    cues: list[Cue]


SYSTEM = """You read advertising creatives for an ad team and list every CULTURAL reference in them:
music, celebrations, festivals, food, films/TV, celebrities, brands, places, sports, fashion, rituals, regional or language cues.
Skip culturally neutral things (smiles, generic sunsets, the product itself).
Rules:
- Return at most 10 cues, most important first. Mark the 1–2 that carry the ad as 'hero'.
- cue.text must be copied verbatim from your `text` field, and must be the WHOLE culturally loaded phrase, not one word:
  "a packed Nashville honky-tonk" rather than "Nashville"; "boots and a cowboy hat" rather than "boots". Settings, outfits, foods,
  music and named places that signal a region are all separate cues, including street or district names (e.g. "Broadway").
- For video or Reels, `text` is a transcript plus brief scene notes, and `at` gives the time range.
- Never identify real people from their face. Only name a person if the caption, on-screen text or speech names them.
- Every concept MUST have 2–3 proxies, each typed as movie, tv_show, artist, brand or music_genre. Food cues use food brands or films
  famous for that food culture; rituals and celebrations use films or music genres strongly tied to them.
- Proxies must be famous enough to exist in a global taste database. Prefer titles and brands from the culture the cue comes from."""


async def extract(text: str | None, media: tuple[bytes, str] | None, caption: str | None, name: str | None) -> Extraction:
    parts: list = []
    if media:
        parts.append(await gemini.media_part(*media))
        parts.append(f"This is an ad creative{f' named {name}' if name else ''}. Read the visuals, on-screen text, speech and music.")
    if text:
        parts.append(f"Ad script or brief:\n{text}")
    if caption:
        parts.append(f"Caption and hashtags:\n{caption}")
    out = await gemini.json_call(Extraction, SYSTEM, parts, temperature=0.2)
    if text and not media:
        out.text = text  # keep the user's script exactly as written
    return out


# ── resolution ───────────────────────────────────────────

_GENERIC = {"pop", "music", "song", "songs", "track", "beat", "heavy", "style", "vibe", "soundtrack"}
_REGIONAL = {"punjabi", "tamil", "telugu", "kannada", "malayalam", "bengali", "marathi", "gujarati", "bhojpuri", "haryanvi", "rajasthani", "assamese", "odia", "hindi", "urdu", "bollywood", "kollywood", "sufi", "qawwali", "carnatic", "hindustani", "bhangra", "ghazal", "lavani", "baul"}


async def _resolve_genre(phrase: str) -> dict | None:
    """Most specific music-genre tag for a phrase: 'dhol-heavy Punjabi pop' → Punjabi, not Pop."""
    words = [w for w in phrase.lower().replace("-", " ").split() if len(w) > 2]
    queries = [phrase] + [w for w in words if w not in _GENERIC]
    pools = await asyncio.gather(*[qloo.tags(q, take=6, tag_types="urn:tag:genre:music") for q in queries[:4]])
    best, best_score = None, 0.0
    for t in (t for pool in pools for t in pool):
        tid = t.get("id") or ""
        if not tid.startswith("urn:tag:genre:music"):
            continue
        tw = set(t["name"].lower().replace("-", " ").split())
        overlap = len(tw & set(words))
        specific = sum(1 for w in tw & set(words) if w not in _GENERIC)
        regional = sum(1 for w in tw & set(words) if w in _REGIONAL)
        score = specific * 2 + overlap + regional * 3 - (0.5 if tw <= _GENERIC else 0)
        if score > best_score:
            best, best_score = t, score
    if not best:
        return None
    return {"kind": "tag", "id": best["id"], "name": best["name"], "type": "urn:tag:genre:music"}

async def _resolve_named(name: str, qtype: str) -> dict | None:
    if qtype == "music_genre":
        return await _resolve_genre(name)
    if qtype == "none":
        return None
    hits = await qloo.search(name, types=f"urn:entity:{qtype}", take=3)
    if not hits:
        return None
    h = hits[0]
    return {"kind": "entity", "id": h["id"], "name": h["name"], "type": h.get("type") or f"urn:entity:{qtype}"}


async def resolve_cue(cue: Cue) -> list[dict]:
    """Signals that stand for the cue in Qloo: the entity itself, a music genre tag, or proxies."""
    if cue.kind == "named" or cue.qloo_type == "music_genre":
        s = await _resolve_named(cue.search, cue.qloo_type)
        if s:
            return [s]
    found = await asyncio.gather(*[_resolve_named(p.name, p.qloo_type) for p in cue.proxies[:3]])
    out, seen = [], set()
    for s in found:
        if s and s["id"] not in seen:
            seen.add(s["id"])
            out.append(s)
    return out


async def score_signals(signals: list[dict], region_list: list[dict]) -> tuple[dict[str, int], list[dict]]:
    """Per-region score (mean over signals) plus each signal's own per-region numbers."""
    scope, mult = regions.heat_scope(region_list)
    cells = await asyncio.gather(*[qloo.heatmap(qloo.heat_params(s), scope) for s in signals])
    per = []
    for s, cs in zip(signals, cells):
        by = {r["name"]: v for r in region_list if (v := regions.score_in(cs, r, mult)) is not None}
        per.append({**s, "byCity": by, "heat": bool(cs), "scope": scope})
    totals: dict[str, int] = {}
    for r in region_list:
        vals = [p["byCity"][r["name"]] for p in per if r["name"] in p["byCity"]]
        if vals:
            totals[r["name"]] = round(sum(vals) / len(vals))
    return totals, per


def _evidence(cue: Cue, per: list[dict], via_proxy: bool) -> dict:
    if not per:
        claim = "Qloo has no entity or tag for this cue, so it is left out of the score. Map it by hand to include it."
    elif via_proxy:
        claim = f"\"{cue.label}\" is a concept, so it is scored through Qloo entities that embody it: {', '.join(p['name'] for p in per)}. Numbers are their mean heatmap affinity in each region."
    else:
        claim = f"Qloo heatmap affinity for \"{per[0]['name']}\", averaged over each region's area."
    calls = []
    for p in per:
        calls.append(qloo.call_string("/v2/tags" if p["kind"] == "tag" else "/search", {"filter.query" if p["kind"] == "tag" else "query": p["name"]}))
        calls.append(qloo.call_string("/v2/insights", {"filter.type": "urn:heatmap", **p.get("scope", {"filter.location.query": "India"}), **qloo.heat_params(p)}))
    return {
        "id": f"ev_{uuid.uuid4().hex[:10]}",
        "title": cue.label,
        "claim": claim,
        "entities": [{"name": p["name"], "type": p["type"], "id": p["id"], "byCity": p["byCity"]} for p in per if p["kind"] == "entity"],
        "tags": [{"name": p["name"], "id": p["id"]} for p in per if p["kind"] == "tag"],
        "tagScores": [{"name": p["name"], "id": p["id"], "byCity": p["byCity"]} for p in per if p["kind"] == "tag"],
        "calls": calls,
    }


async def read_creative(*, text: str | None, media: tuple[bytes, str] | None, caption: str | None, name: str | None, fmt: str, region_names: list[str]) -> dict:
    ex = await extract(text, media, caption, name)
    region_list = [r for r in await asyncio.gather(*[regions.resolve(n) for n in region_names]) if r]

    async def one(cue: Cue):
        signals = await resolve_cue(cue)
        totals, per = await score_signals(signals, region_list) if signals else ({}, [])
        if signals and not totals and signals[0]["kind"] == "tag":
            # Some genre tags have no heatmap data: score the genre through its top artists in Qloo instead.
            artists = await qloo.insights({"filter.type": "urn:entity:artist", "signal.interests.tags": signals[0]["id"], "take": 3})
            stand_ins = [{"kind": "entity", "id": a["id"], "name": a["name"], "type": "urn:entity:artist"} for a in artists[:3]]
            if stand_ins:
                signals = stand_ins
                totals, per = await score_signals(signals, region_list)
        per = [p for p in per if p["heat"]] or per
        via_proxy = bool(signals) and not (cue.kind == "named" or cue.qloo_type == "music_genre") or (bool(signals) and signals[0]["name"].lower() != cue.search.lower() and cue.kind != "named")
        return cue, signals, totals, per, via_proxy

    resolved = await asyncio.gather(*[one(c) for c in ex.cues])
    refs, evidence = [], []
    for cue, signals, totals, per, via_proxy in resolved:
        ev = _evidence(cue, per, via_proxy)
        evidence.append(ev)
        kind = "unmatched" if not totals else ("proxy" if via_proxy else ("tag" if signals[0]["kind"] == "tag" else "entity"))
        text_hit = cue.text if cue.text and cue.text.lower() in ex.text.lower() else cue.label
        refs.append({
            "id": f"ref_{uuid.uuid4().hex[:10]}",
            "cueId": cue.role,
            "text": text_hit,
            "label": cue.label,
            "role": cue.role,
            "source": cue.source,
            "at": cue.at,
            "kind": kind,
            "qlooId": signals[0]["id"] if signals else None,
            "qlooType": cue.qloo_type,
            "prominence": cue.prominence,
            "enabled": kind != "unmatched",
            "scores": totals,
            "signals": [{"kind": s["kind"], "id": s["id"], "name": s["name"], "type": s["type"]} for s in signals],
            "evidenceId": ev["id"],
        })
    creative = {
        "id": f"cr_{uuid.uuid4().hex[:10]}",
        "name": name or ex.name,
        "format": fmt,
        "text": ex.text,
        "refs": refs,
    }
    return {"creative": creative, "evidence": evidence, "regions": region_list}


async def rescore(refs: list[dict], region_names: list[str]) -> dict:
    """Score existing references in new regions (e.g. a city added later)."""
    region_list = [r for r in await asyncio.gather(*[regions.resolve(n) for n in region_names]) if r]
    out = {}
    async def one(ref):
        if ref.get("signals"):
            totals, _ = await score_signals(ref["signals"], region_list)
            out[ref["id"]] = totals
    await asyncio.gather(*[one(r) for r in refs])
    return {"scores": out, "regions": region_list}
