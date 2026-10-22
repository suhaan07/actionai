"""Deep dive: every Qloo signal about an ad and its cities, and a strategist pass that correlates them.

Signals (all aggregate, never about a person):
- skew      who each reference's fans are (age band and gender skew, urn:demographics), blended for the whole ad
- vibe      Qloo's own style/theme tags that set the ad apart from each city's favourites (/v2/insights/compare)
- also      what the ad's audience also loves in each city: brands, podcasts, TV, places (cross-domain insights)
- gems      niche picks in each city (filter.popularity.max) for authentic, cheaper local touches
- rival     each competitor's heatmap affinity per city
- niche     an interest audience's heatmap per city (e.g. Health And Beauty), when the brief names one
- hotspots  where in each city the ad's hero reference is strongest (heatmap cells), named by nearby loved places
- fit, size the existing fit scores and rough audience size

The model is taught to correlate them by a playbook of rules, and every insight it writes must combine at least two kinds of
signal and cite their evidence, or it is dropped.
"""
import asyncio
import math
import uuid
from typing import Literal, Optional

from pydantic import BaseModel, Field

from .. import gemini, qloo, regions

# ── audiences ───────────────────────────────────────────

# Communities (ethnicity, orientation) are left out on purpose: targeting ads by them is risky and restricted on ad platforms.
AUDIENCE_TYPES = ["urn:audience:hobbies_and_interests", "urn:audience:global_issues", "urn:audience:investing_interests"]


async def audience_list() -> list[dict]:
    got = await asyncio.gather(*[qloo.audiences(t) for t in AUDIENCE_TYPES])
    return [a for xs in got for a in xs if a.get("id")]


async def find_audience(name: str | None) -> dict | None:
    if not name:
        return None
    want = name.strip().lower()
    pool = await audience_list()
    exact = next((a for a in pool if a["name"].lower() == want), None)
    if exact:
        return exact
    words = {w for w in want.replace("&", " ").split() if len(w) > 2}
    scored = sorted(((len(words & set(a["name"].lower().split())), a) for a in pool), key=lambda x: -x[0])
    return scored[0][1] if scored and scored[0][0] else None


# ── skew ────────────────────────────────────────────────

BANDS = qloo.AGE_BANDS
BAND_LABEL = {"24_and_younger": "18–24", "25_to_29": "25–29", "30_to_34": "30–34", "35_to_44": "35–44", "45_to_54": "45–54", "55_and_older": "55+"}
WEIGHT = {"hero": 3, "support": 2, "background": 1}


def blend(skews: list[tuple[dict, float]]) -> dict | None:
    skews = [(s, w) for s, w in skews if s]
    if not skews:
        return None
    total = sum(w for _, w in skews)
    age = {b: round(sum(s["age"].get(b, 0) * w for s, w in skews) / total, 2) for b in BANDS}
    gender = {g: round(sum(s["gender"].get(g, 0) * w for s, w in skews) / total, 2) for g in ("male", "female")}
    return {"age": age, "gender": gender}


def describe(s: dict | None) -> str:
    if not s:
        return "no demographic data"
    top = max(BANDS, key=lambda b: s["age"].get(b, -9))
    male = s["gender"].get("male", 0)
    lean = "gender-even" if abs(male) < 0.15 else f"{'male' if male > 0 else 'female'} ({abs(male):.2f})"
    return f"skews {BAND_LABEL[top]} ({s['age'][top]:+.2f}), {lean}"


def match(s: dict | None, audience: str | None) -> float | None:
    """How well the skew lines up with the target age range: mean skew over the target's bands (−1…1)."""
    bands = (qloo.age_param(audience) or "").split(",")
    bands = [b for b in bands if b]
    if not s or not bands:
        return None
    return round(sum(s["age"].get(b, 0) for b in bands) / len(bands), 2)


async def ref_skews(creative: dict) -> list[dict]:
    """Skew of each usable reference, through its first entity signal (tags have no demographics)."""
    rows = []
    for r in creative.get("refs", []):
        if not r.get("enabled") or r.get("kind") == "unmatched":
            continue
        ent = next((s for s in r.get("signals") or [] if s.get("kind") == "entity"), None)
        if ent:
            rows.append((r, ent))
    got = await asyncio.gather(*[qloo.demographics(e["id"]) for _, e in rows[:8]])
    return [{"refId": r["id"], "label": r["label"], "prominence": r.get("prominence", "support"), "via": e["name"], "viaId": e["id"], "skew": s}
            for (r, e), s in zip(rows[:8], got) if s]


async def skew_bundle(creative: dict, audience: str | None) -> dict:
    refs = await ref_skews(creative)
    ad = blend([(r["skew"], WEIGHT.get(r["prominence"], 2)) for r in refs])
    evidence = []
    for r in refs:
        ev = _ev(f"Who “{r['label']}” speaks to", f"Fans of {r['via']} {describe(r['skew'])}. Skew is −1…1 against everyone Qloo sees: 0 is average, positive over-indexes.",
                 calls=[qloo.call_string("/v2/insights", {"filter.type": "urn:demographics", "signal.interests.entities": r["viaId"]})])
        ev["skew"] = r["skew"]
        r["evidenceId"] = ev["id"]
        evidence.append(ev)
    m = match(ad, audience)
    return {"ad": ad, "refs": refs, "target": {"audience": audience, "match": m}, "evidence": evidence}


# ── helpers ─────────────────────────────────────────────

def _ev(title: str, claim: str, entities=None, tags=None, tag_scores=None, calls=None) -> dict:
    return {"id": f"ev_{uuid.uuid4().hex[:10]}", "title": title, "claim": claim, "entities": entities or [], "tags": tags or [], "tagScores": tag_scores or [], "calls": calls or []}


def _item(e: dict) -> dict:
    about = e.get("short_description") or e.get("description") or ", ".join((e.get("keywords") or [])[:4]) or ""
    return {"id": e["id"], "name": e["name"], "type": e.get("type"), "affinity": round(e["affinity"], 2) if e.get("affinity") is not None else None,
            "popularity": round(e["popularity"], 2) if e.get("popularity") is not None else None, "about": str(about)[:120],
            **({"lat": e["lat"], "lon": e["lon"]} if e.get("lat") is not None else {})}


def _vibe_tags(xs: list[dict]) -> list[str]:
    keep = [t["name"] for t in xs if any(k in (t.get("type") or t.get("id") or "") for k in ("style", "theme", "audience", "genre"))]
    return list(dict.fromkeys(keep))[:5]


def _km(a, b) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


# ── per city ────────────────────────────────────────────

ALSO = [("brands", "urn:entity:brand"), ("podcasts", "urn:entity:podcast"), ("tv", "urn:entity:tv_show")]
LISTS = ["brands", "podcasts", "tv", "places", "gems"]
_SKIP_PLACE = ("hotel", "marriott", "taj ", "itc ", "airport", "hyatt", "leela", "oberoi", "radisson", "novotel", "hilton", "westin", "regis", "resort", "hospital")


def distinct(cities: dict[str, dict], keep: int = 5) -> None:
    """Drop what every city shares, so each city's lists show what is local; keep the top `keep` (or the shared ones if nothing is left)."""
    if len(cities) < 3:
        for b in cities.values():
            for k in LISTS:
                b[k] = b[k][:keep]
        return
    for k in LISTS:
        count: dict[str, int] = {}
        for b in cities.values():
            for i in b[k]:
                count[i["id"]] = count.get(i["id"], 0) + 1
        for b in cities.values():
            local = [i for i in b[k] if count[i["id"]] < len(cities)]
            b[k] = (local if len(local) >= 2 else b[k])[:keep]


async def city_bundle(region: dict, heroes: list[str], competitors: set[str], interest: dict | None) -> dict:
    loc = regions.location_params(region)
    seed = {"signal.interests.entities": ",".join(heroes)} if heroes else {}
    aud = {"signal.demographics.audiences": interest["id"]} if interest else {}

    async def also(ftype: str):
        return await qloo.insights({"filter.type": ftype, **loc, **seed, **aud, "take": 12})

    async def places():
        # Places the ad's audience loves inside the city: venues for shoots, pop-ups and outdoor.
        p = {"filter.type": "urn:entity:place", **seed, **aud, "take": 15}
        p.update({"filter.location.query": region["name"]} if region.get("kind") != "town" else {"filter.location": f"POINT({region['lon']} {region['lat']})", "filter.location.radius": int(region["radius_km"] * 1000)})
        return await qloo.insights(p)

    async def gems():
        return await qloo.insights({"filter.type": "urn:entity:artist", **loc, **seed, "filter.popularity.max": 0.35, "take": 10})

    async def tops():
        # Same params as the city profile, so this is a cache hit when Create has run.
        a, m = await asyncio.gather(qloo.insights({"filter.type": "urn:entity:artist", **loc, "take": 12}), qloo.insights({"filter.type": "urn:entity:movie", **loc, "take": 12}))
        return [e["id"] for e in a[:2] + m[:1]]

    got = await asyncio.gather(*[also(t) for _, t in ALSO], places(), gems(), tops())
    out = {k: [_item(e) for e in xs if e["name"].strip().lower() not in competitors] for (k, _), xs in zip(ALSO, got[:3])}
    out["places"] = [_item(e) for e in got[3] if e.get("lat") is not None and not any(w in e["name"].lower() for w in _SKIP_PLACE)]
    out["gems"] = [_item(e) for e in got[4]]
    vibe = {"ad": [], "city": []}
    if heroes and got[5]:
        cmp = await qloo.compare(heroes, got[5])
        vibe = {"ad": _vibe_tags(cmp.get("a", [])), "city": _vibe_tags(cmp.get("b", []))}
    out["vibe"] = vibe
    return out


def hotspots(cells: list, region: dict, mult: float, places: list[dict]) -> dict | None:
    here = (region["lat"], region["lon"])
    r = region.get("radius_km", 40) * mult
    inside = [c for c in cells if _km(here, (c[0], c[1])) <= r]
    if not inside:
        return None
    top = sorted(inside, key=lambda c: -c[2])[:4]
    named = []
    for c in top:
        near = min(places, key=lambda p: _km((c[0], c[1]), (p["lat"], p["lon"])), default=None)
        if near and _km((c[0], c[1]), (near["lat"], near["lon"])) <= 6:
            named.append(near["name"])
    return {"center": [region["lat"], region["lon"]], "radius_km": r, "cells": sorted(inside, key=lambda c: -c[2])[:120], "near": list(dict.fromkeys(named))}


# ── the strategist pass ─────────────────────────────────

Kind = Literal["fit", "skew", "vibe", "also", "gems", "rival", "niche", "hotspots", "size"]


class Action(BaseModel):
    label: str = Field(description="Button text, 2–5 words, e.g. 'Swap the track for Chennai'")
    agent: Literal["adapt", "spend", "test", "create", "grow"]
    prompt: str = Field(description="What to send that agent, in plain words, naming the city and element")


class Insight(BaseModel):
    headline: str = Field(description="One punchy line with a number in it")
    body: str = Field(description="2–3 sentences that connect the signals and say what to do")
    kinds: list[Kind] = Field(description="Which signal kinds this insight combines (at least two)")
    evidence: list[str] = Field(description="Evidence ids from the sheet ([ev_…]) that back it")
    action: Optional[Action] = None


class Read(BaseModel):
    summary: str = Field(description="One sentence: the single most important thing this team should do, with a number")
    insights: list[Insight]


PLAYBOOK = """How the signals relate (use these to connect them; never treat one alone as the insight):
1. fit × skew: a reference that fits a city but whose fans skew away from the target audience is a hidden risk; one that fits AND
   skews toward the target is the anchor to keep. A weak target match means the ad will reach the wrong people even where it fits.
2. fit × size: a big city with weak fit is where to fix the ad before spending; a small city with strong fit is a cheap test market.
3. vibe × fit: when a city scores low, explain it with the vibe gap (the ad's tags vs the city's tags) and point fixes toward the
   city's tags.
4. also × fit: partners (brands, podcasts, shows) loved in high-fit cities amplify; in low-fit cities a loved local partner bridges
   the gap. Prefer partners with high affinity; say if they are mainstream or niche (popularity). The lists are what the audience
   loves, not all are sensible partners: only recommend ones that make sense next to the product (no luxury cars for a sweets brand).
5. rival × fit: a competitor strong where you are weak is a city to defend with a better-fitting version; a competitor weak where you
   are strong is an open door.
6. hotspots × places: shoots, pop-ups and outdoor go where the hero reference's hottest cells meet venues the audience loves.
7. niche × fit: where the interest audience concentrates AND the ad fits is the primary market; interest high but fit low means adapt.
8. gems × skew: niche picks feel authentic and cost less; use them when the mainstream pick skews away from the target.
Thresholds: fit 75+ is strong, 60–74 middling, under 60 weak. A skew or match of ±0.15 or more is meaningful. For rivals, compare
each city to the rival's own average (big brands score high everywhere): above average is where they are strong. A rival's score and
the ad's fit are different measures: never compare them to each other, only each against its own scale.
Write 4–6 insights. Each must combine at least two signal kinds, quote the numbers, cite evidence ids exactly as written in the sheet,
and end in one concrete action for an agent. Never invent numbers, names, ROAS or A/B results, and never propose budget percentages
(the Spend agent computes the starting split); fit is pre-testing. Never describe or target individuals; skews describe fans of a reference in aggregate."""


SYSTEM = "You are the strategist on an ad team. You read a sheet of Qloo taste signals about one ad across cities and connect them into decisions.\n\n" + PLAYBOOK


def sheet(*, fits: dict, sizes: dict, skew: dict, cities: dict, rivals: list[dict], niche: dict | None, spots: dict, ev_ids: dict) -> str:
    """The signal sheet: every signal in one compact block, each tagged with the evidence id that backs it."""
    L = ["FIT (Qloo heatmap affinity 0–100): " + ", ".join(f"{c} {v}" for c, v in sorted(fits.items(), key=lambda x: -x[1]))]
    L.append("SIZE (18–34s, millions, rough): " + ", ".join(f"{c} {v}" for c, v in sizes.items()))
    m = skew["target"]["match"]
    L.append(f"AD SKEW: {describe(skew['ad'])}" + (f"; target {skew['target']['audience']} match {m:+.2f} ({'leans toward' if m > 0.1 else 'leans away from' if m < -0.1 else 'neutral to'} the target)" if m is not None else ""))
    for r in skew["refs"]:
        L.append(f"  - “{r['label']}” via {r['via']}: {describe(r['skew'])} [{r['evidenceId']}]")
    for c, b in cities.items():
        L.append(f"CITY {c}:")
        if b["vibe"]["ad"] or b["vibe"]["city"]:
            L.append(f"  vibe: the ad stands out as {', '.join(b['vibe']['ad']) or '—'}; {c}'s favourites as {', '.join(b['vibe']['city']) or '—'} [{ev_ids.get(('vibe', c), '')}]")
        for k, label in (("brands", "brands"), ("podcasts", "podcasts"), ("tv", "TV")):
            if b[k]:
                L.append(f"  also loves ({label}): " + "; ".join(f"{i['name']} (aff {i['affinity']}, pop {i['popularity']})" for i in b[k][:4]) + f" [{ev_ids.get(('also', c), '')}]")
        if b["places"]:
            L.append("  loved places: " + "; ".join(i["name"] for i in b["places"][:5]))
        if b["gems"]:
            L.append("  niche gems (artists): " + "; ".join(f"{i['name']} (pop {i['popularity']})" for i in b["gems"]) + f" [{ev_ids.get(('gems', c), '')}]")
        if spots.get(c) and spots[c]["near"]:
            L.append(f"  hotspots for the hero reference: near {', '.join(spots[c]['near'])} [{ev_ids.get(('hotspots', c), '')}]")
    for r in rivals:
        avg = sum(r["byCity"].values()) / len(r["byCity"])
        # Only the rival's strength relative to its own average: its raw scores are not on the same scale as the ad's fit.
        L.append(f"RIVAL {r['name']} strength vs its own average: " + ", ".join(f"{c} {v - avg:+.0f}" for c, v in r["byCity"].items()) + f" [{r['evidenceId']}]")
    if niche:
        L.append(f"NICHE AUDIENCE {niche['name']} concentration: " + ", ".join(f"{c} {v}" for c, v in niche["byCity"].items()) + f" [{niche['evidenceId']}]")
    return "\n".join(L)


def _fit(creative: dict, city: str) -> int | None:
    s = w = 0
    for r in creative.get("refs", []):
        v = (r.get("scores") or {}).get(city)
        if not r.get("enabled") or r.get("kind") == "unmatched" or v is None:
            continue
        s += v * WEIGHT.get(r.get("prominence"), 2)
        w += WEIGHT.get(r.get("prominence"), 2)
    return round(s / w) if w else None


async def deep(*, creative: dict, region_names: list[str], brief: dict, audience: str | None, interest: str | None, sizes: dict[str, float]) -> dict:
    names = list(dict.fromkeys(regions.canonical(n) for n in region_names))[:6]
    region_list = [r for r in await asyncio.gather(*[regions.resolve(n) for n in names]) if r]
    scope, mult = regions.heat_scope(region_list)
    competitors = {c.strip().lower() for c in str(brief.get("competitors") or "").split(",") if c.strip()}
    aud = await find_audience(interest)

    refs = [r for r in creative.get("refs", []) if r.get("enabled") and r.get("kind") != "unmatched" and r.get("signals")]
    refs.sort(key=lambda r: -WEIGHT.get(r.get("prominence"), 2))
    heroes = list(dict.fromkeys(s["id"] for r in refs for s in r["signals"] if s["kind"] == "entity"))[:3]
    hero_sig = refs[0]["signals"][0] if refs else None

    async def rival(name: str):
        hits = await qloo.search(name, types="urn:entity:brand", take=1)
        if not hits:
            return None
        sig = {"kind": "entity", "id": hits[0]["id"], "name": hits[0]["name"], "type": "urn:entity:brand"}
        cells = await qloo.heatmap(qloo.heat_params(sig), scope)
        return {"name": sig["name"], "id": sig["id"], "byCity": {r["name"]: v for r in region_list if (v := regions.score_in(cells, r, mult)) is not None}}

    async def niche():
        if not aud:
            return None
        sig = {"kind": "audience", "id": aud["id"]}
        cells = await qloo.heatmap(qloo.heat_params(sig), scope)
        return {"name": aud["name"], "id": aud["id"], "byCity": {r["name"]: v for r in region_list if (v := regions.score_in(cells, r, mult)) is not None}}

    skew_b, city_b, rivals, niche_b, hero_cells = await asyncio.gather(
        skew_bundle(creative, audience),
        asyncio.gather(*[city_bundle(r, heroes, competitors, aud) for r in region_list]),
        asyncio.gather(*[rival(n) for n in list(competitors)[:3]]),
        niche(),
        qloo.heatmap(qloo.heat_params(hero_sig), scope) if hero_sig else asyncio.sleep(0, result=[]),
    )
    cities = {r["name"]: b for r, b in zip(region_list, city_b)}
    distinct(cities)
    rivals = [r for r in rivals if r and r["byCity"]]
    spots = {r["name"]: h for r in region_list if (h := hotspots(hero_cells or [], r, mult, cities[r["name"]]["places"]))}

    # Evidence for each section, so every number in the read can be opened.
    evidence = list(skew_b["evidence"])
    ev_ids: dict = {}
    seed_txt = ",".join(heroes)
    for c, b in cities.items():
        if b["vibe"]["ad"] or b["vibe"]["city"]:
            ev = _ev(f"Vibe gap in {c}", f"Qloo's tags that set the ad's main references apart: {', '.join(b['vibe']['ad']) or '—'}. What sets {c}'s top artists and film apart: {', '.join(b['vibe']['city']) or '—'}.",
                     tags=[{"name": t, "id": t} for t in b["vibe"]["ad"] + b["vibe"]["city"]],
                     calls=[qloo.call_string("/v2/insights/compare", {"a.signal.interests.entities": seed_txt, "b.signal.interests.entities": f"<{c} top artists and film>"})])
            evidence.append(ev)
            ev_ids[("vibe", c)] = ev["id"]
        partners = b["brands"][:3] + b["podcasts"][:2] + b["tv"][:2]
        if partners:
            ev = _ev(f"What this audience also loves in {c}", "Cross-domain affinity: what fans of the ad's main references in this city over-index on. Affinity 0–1; popularity 0–1 (1 = mainstream).",
                     entities=[{"name": i["name"], "type": i["type"], "id": i["id"], "byCity": {c: round((i["affinity"] or 0) * 100)}} for i in partners],
                     calls=[qloo.call_string("/v2/insights", {"filter.type": t, "signal.location.query": c, "signal.interests.entities": seed_txt}) for _, t in ALSO])
            evidence.append(ev)
            ev_ids[("also", c)] = ev["id"]
            for i in partners:
                i["evidenceId"] = ev["id"]
        if b["gems"]:
            ev = _ev(f"Niche picks in {c}", "Artists this city's audience over-indexes on that are not mainstream (Qloo popularity under 0.35): authentic local touches that cost less to license.",
                     entities=[{"name": i["name"], "type": i["type"], "id": i["id"], "byCity": {c: round((i["affinity"] or 0) * 100)}} for i in b["gems"]],
                     calls=[qloo.call_string("/v2/insights", {"filter.type": "urn:entity:artist", "signal.location.query": c, "filter.popularity.max": 0.35})])
            evidence.append(ev)
            ev_ids[("gems", c)] = ev["id"]
        if spots.get(c):
            ev = _ev(f"Hotspots in {c}", f"Where in {c} the ad's hero reference ({hero_sig['name']}) is strongest, from Qloo heatmap cells, named by nearby places this audience loves.",
                     calls=[qloo.call_string("/v2/insights", {"filter.type": "urn:heatmap", **scope, **qloo.heat_params(hero_sig)})])
            evidence.append(ev)
            ev_ids[("hotspots", c)] = ev["id"]
            spots[c]["evidenceId"] = ev["id"]
    for r in rivals:
        ev = _ev(f"Competitor: {r['name']}", f"Qloo heatmap affinity for {r['name']} in each city.", entities=[{"name": r["name"], "type": "urn:entity:brand", "id": r["id"], "byCity": r["byCity"]}],
                 calls=[qloo.call_string("/v2/insights", {"filter.type": "urn:heatmap", **scope, "signal.interests.entities": r["id"]})])
        evidence.append(ev)
        r["evidenceId"] = ev["id"]
    if niche_b:
        ev = _ev(f"Where {niche_b['name']} fans live", f"Qloo heatmap of the {niche_b['name']} audience: how concentrated it is in each city.",
                 calls=[qloo.call_string("/v2/insights", {"filter.type": "urn:heatmap", **scope, "signal.demographics.audiences": niche_b["id"]})])
        evidence.append(ev)
        niche_b["evidenceId"] = ev["id"]

    fits = {c: f for c in cities if (f := _fit(creative, c)) is not None}
    text = sheet(fits=fits, sizes={c: sizes.get(c, 1) for c in cities}, skew=skew_b, cities=cities, rivals=rivals, niche=niche_b, spots=spots, ev_ids=ev_ids)
    brief_txt = "; ".join(f"{k}: {v}" for k, v in brief.items() if v and k != "request")
    out = await gemini.json_call(Read, SYSTEM, [f"BRIEF: {brief_txt}\nTARGET AUDIENCE: {audience or 'adults'}\nAD: {creative.get('name')}\n{str(creative.get('text', ''))[:900]}\n\nSIGNAL SHEET\n{text}"], temperature=0.4)

    known = {e["id"] for e in evidence}
    insights = []
    for i in out.insights:
        cited = [e for e in i.evidence if e in known]
        if len(set(i.kinds)) < 2 or not cited:
            continue  # the playbook's rule: an insight connects at least two signals and shows its evidence
        insights.append({**i.model_dump(), "evidence": cited})

    return {
        "summary": out.summary,
        "insights": insights,
        "skew": {k: v for k, v in skew_b.items() if k != "evidence"},
        "cities": cities,
        "rivals": rivals,
        "niche": niche_b,
        "hotspots": spots,
        "hero": hero_sig["name"] if hero_sig else None,
        "fits": fits,
        "evidence": evidence,
        "sheet": text,
    }
