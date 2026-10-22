"""Ask: free-form questions answered from Qloo data (e.g. 'who could be our brand ambassador?').

Groq plans the lookups, Qloo runs them, Groq writes the answer from the results only.
- Seeds keep lookups on-topic: Qloo's location lists are a city's general favourites, so a cricket question is seeded with
  famous cricket names (per market) and Qloo returns what that city's audience pairs with them: other cricketers.
- Candidates the user names ("maybe Virat Kohli?") are scored directly per city, and the answer gives a verdict on each.
"""
import asyncio
import uuid
from typing import Literal

from pydantic import BaseModel, Field

from .. import gemini, qloo, regions
from . import intel

LookupType = Literal["artist", "movie", "tv_show", "brand", "person", "place", "book", "podcast", "music_genre"]


class Lookup(BaseModel):
    type: LookupType
    why: str = Field(description="What this lookup answers")


class Candidate(BaseModel):
    name: str
    type: Literal["artist", "movie", "tv_show", "brand", "person"]


class AskPlan(BaseModel):
    lookups: list[Lookup] = Field(description="1–3 Qloo lookups that answer the question")
    topic: str = Field(default="", description="The product category or theme the answer must stay within, e.g. 'cricket', 'coffee', '' if none")
    occupation: str = Field(default="", description="For person lookups on a topic: the occupation Qloo tags people with, singular, e.g. 'cricketer', 'footballer', 'chef', 'rapper', 'tennis player'. Empty if none")
    candidates: list[Candidate] = Field(default_factory=list, description="Specific names the user proposes or asks about, e.g. 'maybe Virat Kohli?' → Virat Kohli")
    agent: Literal["create", "test", "adapt", "spend"] = Field(description="The agent whose job this is closest to (ambassadors and creators → spend, collabs and ideas → create)")


class AskAnswer(BaseModel):
    text: str = Field(description="3–6 sentences answering the question. If the user named candidates, start with a clear verdict on each, with numbers")
    cited: list[str] = Field(description="Names you recommend or discuss, copied exactly from the data, best first (max 5)")


PLAN_SYSTEM = """You plan lookups in Qloo's taste graph to answer an ad team's question. Qloo returns what an audience in a region
over-indexes on, per entity type: artist, movie, tv_show, brand, person (public figures), place, book, podcast, music_genre.
Pick the 1–3 types that answer the question. Brand ambassadors and creators: person (and artist for music products).
Collabs and tie-ins: brand, movie, tv_show.
A city's plain list is its general favourites, so whenever the product has a category, set topic (cricket bats → 'cricket') and,
for ambassador or creator questions, the occupation Qloo would tag those people with ('cricketer'). Do not name people yourself.
Social creators (Instagram, YouTube, Reels) use occupation 'influencer' (or 'youtuber' for YouTube).
Put any names the user suggests in candidates."""

ANSWER_SYSTEM = """You answer an ad team's question using ONLY the Qloo results given.
- If the user named candidates, open with a verdict on each from the CANDIDATE SCORES (Qloo heatmap affinity 0–100 per city):
  strong where they score high, weak where low, with the numbers. Where a fan skew is given, connect it: a name that scores high but
  whose fans skew away from the target audience (match below −0.15) reaches the wrong people; say so.
- When the question is about one city, rank picks by their score IN THAT CITY from CANDIDATE SCORES, highest first, and quote it.
- Recommend names that fit the TOPIC. The topic-seeded lists are the on-topic ones; ignore general-favourite names that have nothing to
  do with the topic (e.g. actors for a cricket ambassador), unless the user asked for non-specialists.
- For social creators, say plainly that Qloo ranks them by city taste, not by the product category, and never call someone an
  "on-topic" or category creator unless the data says so. Flag picks whose city score is under 60 as weak.
- Say which city each pick is strongest in. The [in N/M cities] tag shows how widely a name appears: N/M means it works across cities.
- Be practical: favour family-safe figures for brands aimed at children, and remind the team to check availability, fees and
  brand-safety history. Never invent names, follower counts or prices. Never name the brand's competitors as partners."""


def _row(e: dict, typ: str) -> dict:
    return {"id": e["id"], "name": e["name"], "type": typ, "kind": "entity", "about": (e.get("short_description") or e.get("description") or "")[:120],
            "popularity": e.get("popularity")}


def _has_occupation(e: dict, tag: dict) -> bool:
    """Qloo uses more than one id for the same occupation (…:wikidata:cricketer, …:person:cricketer): match on the name."""
    name = (tag.get("name") or "").strip().lower()
    return any((t.get("id") or "").startswith("urn:tag:occupation:") and (t.get("name") or "").strip().lower() == name for t in e.get("tags") or [])


_CREATOR_WORDS = {"influencer", "youtuber", "content creator", "creator", "vlogger", "instagrammer", "social media influencer", "tiktoker"}
_CREATOR_OCCUPATIONS = {"influencer", "youtuber", "content creator", "vlogger", "video blogger", "media personality", "comedian",
                        "stand-up comedian", "internet celebrity", "social media influencer", "blogger", "podcaster"}


# Creators a small creator could realistically collab with: people who make social content, not TV personalities.
_SOCIAL_OCCUPATIONS = {"influencer", "youtuber", "content creator", "vlogger", "video blogger", "internet celebrity", "social media influencer",
                       "instagrammer", "tiktoker", "streamer"}


def _is_creator(e: dict, occupations: set[str] = _CREATOR_OCCUPATIONS) -> bool:
    return any((t.get("id") or "").startswith("urn:tag:occupation:") and (t.get("name") or "").strip().lower() in occupations for t in e.get("tags") or [])


async def local_creators(region: dict, take: int = 10, social_only: bool = False, max_pop: float | None = None) -> list[dict]:
    """Social creators a region's audience over-indexes on: its own top 100 public figures, kept if Qloo tags them as creators.
    max_pop keeps to less famous people (Qloo popularity 0–1), the ones a small creator can actually collab with."""
    p = {"filter.type": "urn:entity:person", **regions.location_params(region), **({"filter.popularity.max": max_pop} if max_pop else {})}
    people = []
    for page in (1, 2):
        people += await qloo.insights({**p, "take": 50, "page": page})
    occ = _SOCIAL_OCCUPATIONS if social_only else _CREATOR_OCCUPATIONS
    return [_row(e, "urn:entity:person") for e in people if _is_creator(e, occ)][:take]


async def _occupation(word: str) -> tuple[dict | None, list[dict]]:
    """Qloo's occupation tag for a word, and the most popular people Qloo tags with it (used as seeds)."""
    word = (word or "").strip().lower()
    if not word:
        return None, []
    tag = next((t for t in await qloo.tags(word, take=8) if (t.get("id") or "").startswith("urn:tag:occupation:")), None)
    if not tag:
        return None, []
    people = [e for e in await qloo.search(word, types="urn:entity:person", take=25) if _has_occupation(e, tag)]
    people.sort(key=lambda e: e.get("popularity") or 0, reverse=True)
    return tag, [{"id": e["id"], "name": e["name"]} for e in people[:3]]


async def ask(question: str, brief: dict, region_names: list[str], audience: str | None) -> dict:
    names = [regions.canonical(n) for n in region_names][:6] or ["Delhi", "Mumbai", "Chennai", "Kolkata"]
    brief_txt = "; ".join(f"{k}: {v}" for k, v in brief.items() if v)
    resolved = [r for r in await asyncio.gather(*[regions.resolve(n) for n in names]) if r]
    markets = sorted({r.get("country") or "unknown" for r in resolved})
    plan = await gemini.json_call(AskPlan, PLAN_SYSTEM, [f"BRIEF: {brief_txt}\nMARKETS IN PLAY: {', '.join(markets)}\nQUESTION: {question}"], temperature=0.0, prefer="groq")
    age = qloo.age_param(audience)

    # Resolve seeds and candidates to Qloo entities.
    async def find(name: str, typ: str):
        hits = await qloo.search(name, types=f"urn:entity:{typ}", take=1)
        return _row(hits[0], f"urn:entity:{typ}") if hits else None

    cands = [e for e in await asyncio.gather(*[find(c.name, c.type) for c in plan.candidates[:3]]) if e]

    # Topic people come from Qloo itself: its occupation tag, the most popular people carrying it as seeds,
    # then each city's ranking around them, kept only if Qloo tags them with that occupation.
    # Social creators: Qloo doesn't tie creators to a product category, so rank each city's own public figures and keep the
    # creator-type ones (seeding with global influencers returns the same names for every brand and city).
    creator_mode = (plan.occupation or "").strip().lower() in _CREATOR_WORDS
    occ_tag, seeds = (None, []) if creator_mode else await _occupation(plan.occupation)

    def seeds_for(region: dict) -> list[str]:
        return [e["id"] for e in seeds]

    def on_topic(e: dict) -> bool:
        return not occ_tag or _has_occupation(e, occ_tag)

    async def run(lk: Lookup, region: dict):
        loc = regions.location_params(region)
        if lk.type == "music_genre":
            items = await qloo.insights({"filter.type": "urn:tag", "filter.tag.types": "urn:tag:genre:music", **loc, "take": 8})
            return lk, region["name"], [{"id": t["id"], "name": t["name"].strip(), "type": "urn:tag:genre:music", "kind": "tag"} for t in items if t.get("id")], False
        p = {"filter.type": f"urn:entity:{lk.type}", **loc, "take": 10}
        if creator_mode and lk.type == "person":
            return lk, region["name"], await local_creators(region), "creators"
        seed_ids = seeds_for(region) if lk.type == "person" else []
        if seed_ids:
            # On-topic: what this city's audience pairs with the topic's own people, filtered by Qloo's occupation tag.
            items = [e for e in await qloo.insights({**p, "signal.interests.entities": ",".join(seed_ids), "take": 25}) if on_topic(e)]
            if items:
                return lk, region["name"], [_row(e, f"urn:entity:{lk.type}") for e in items[:10]], True
        # Local scenes (artists, genres) come from city-level taste; age filters flatten them into global hits.
        items = [] if lk.type in ("artist", "music_genre") or not age else await qloo.insights({**p, "signal.demographics.age": age})
        items = items or await qloo.insights(p)
        return lk, region["name"], [_row(e, f"urn:entity:{lk.type}") for e in items], False

    results = await asyncio.gather(*[run(lk, r) for lk in plan.lookups[:3] for r in resolved])
    by_name: dict[str, dict] = {c["name"].lower(): c for c in cands}
    spread: dict[str, set] = {}
    for _, region, items, _ in results:
        for i in items:
            spread.setdefault(i["name"].lower(), set()).add(region)
    lines = []
    for lk, region, items, seeded in results:
        label = (f"social creators {region}'s audience over-indexes on (Qloo does NOT link these to {plan.topic or 'the product'}; check category fit yourself)"
                 if seeded == "creators" else f"{lk.type} in {region}, {'on-topic (' + plan.topic + ')' if seeded else 'general favourites'}")
        lines.append(f"{label}: " + "; ".join(f"{i['name']} [in {len(spread[i['name'].lower()])}/{len(resolved)} cities]{' — ' + i['about'] if i.get('about') else ''}" for i in items))
        for i in items:
            by_name.setdefault(i["name"].lower(), i)

    # Score named candidates (and, for creators, every creator found) per city before answering, so the answer ranks by numbers.
    scope, mult = regions.heat_scope(resolved)
    extra = []
    if creator_mode:
        seen = {c["id"] for c in cands}
        for _, _, items, _ in results:
            for i in items:
                if i["kind"] == "entity" and i["id"] not in seen and len(extra) < 8:
                    seen.add(i["id"])
                    extra.append(i)
    suggested = {c["name"] for c in cands}
    cands = cands + extra
    cand_cells = await asyncio.gather(*[qloo.heatmap(qloo.heat_params(c), scope) for c in cands])
    cand_scores = {c["name"]: {r["name"]: v for r in resolved if (v := regions.score_in(cs, r, mult)) is not None} for c, cs in zip(cands, cand_cells)}
    # Who each named candidate's fans are (aggregate age/gender skew), so the verdict weighs fit AND audience match together.
    named = [c for c in cands if c["name"] in suggested]
    skews = dict(zip([c["name"] for c in named], await asyncio.gather(*[qloo.demographics(c["id"]) for c in named])))
    cand_txt = "\n".join(f"- {n}{' (user suggested)' if n in suggested else ''}: " + ", ".join(f"{k} {v}" for k, v in sc.items())
                         + (f" | fans {intel.describe(skews[n])}, match with {audience or 'the target'}: {intel.match(skews[n], audience)}" if skews.get(n) else "")
                         for n, sc in cand_scores.items())

    answer = await gemini.json_call(
        AskAnswer, ANSWER_SYSTEM,
        [f"BRIEF: {brief_txt}\nAUDIENCE: {audience or 'adults'}\nTOPIC: {plan.topic or 'none'}\nQUESTION: {question}"
         + (f"\n\nCANDIDATE SCORES\n{cand_txt}" if cand_txt else "")
         + "\n\nQLOO RESULTS\n" + "\n".join(lines)],
        temperature=0.4, prefer="groq",
    )

    # Evidence: candidates first, then each cited pick's heatmap affinity across the campaign's regions.
    picks: list[dict] = list(cands)
    for c in answer.cited:
        p = by_name.get(c.lower())
        if p and p not in picks:
            picks.append(p)
    picks = picks[:6]
    known = {c["id"]: cand_scores[c["name"]] for c in cands}
    todo = [p for p in picks if p["id"] not in known]
    cells = await asyncio.gather(*[qloo.heatmap(qloo.heat_params(p), scope) for p in todo])
    for p, cs in zip(todo, cells):
        known[p["id"]] = {r["name"]: v for r in resolved if (v := regions.score_in(cs, r, mult)) is not None}
    seed_note = f" On-topic list: people Qloo tags as {occ_tag['name']}, ranked by what each city's audience over-indexes on." if occ_tag and seeds else ""
    evidence = []
    for p in picks:
        by = known[p["id"]]
        evidence.append({
            "id": f"ev_{uuid.uuid4().hex[:10]}",
            "title": p["name"],
            "claim": (p.get("about") or "Ranked by Qloo among what this audience over-indexes on.") + seed_note,
            "entities": [{"name": p["name"], "type": p["type"], "id": p["id"], "byCity": by}] if p["kind"] == "entity" else [],
            "tags": [{"name": p["name"], "id": p["id"]}] if p["kind"] == "tag" else [],
            "tagScores": [{"name": p["name"], "id": p["id"], "byCity": by}] if p["kind"] == "tag" else [],
            "calls": [qloo.call_string("/v2/insights", {"filter.type": p["type"] if p["kind"] == "entity" else "urn:tag", "signal.location.query": "{region}",
                                                        **({"signal.interests.entities": ",".join(e["id"] for e in seeds)} if seeds else {})}),
                      qloo.call_string("/v2/insights", {"filter.type": "urn:heatmap", **scope, **qloo.heat_params(p)})],
        })
    return {"text": answer.text, "agent": plan.agent, "evidence": evidence}
