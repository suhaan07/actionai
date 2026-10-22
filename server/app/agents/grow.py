"""Grow: for creators and small brands without a media team. Which cities their content will land in next, and for each one a
hook, caption, hashtags and audio direction grounded in that city's Qloo taste, one local touch to add, and local creators to collab with.

The client ranks the cities (Qloo fit of the content × audience size); this writes the per-city post plan for the top ones.
"""
import asyncio
import uuid

from pydantic import BaseModel, Field

from .. import gemini, qloo, regions
from . import ask as ask_agent
from . import intel
from . import profile as profile_agent
from . import sensitivity


class LocalTouch(BaseModel):
    text: str = Field(description="One concrete thing to add to the next post for this city, e.g. 'open on a Kishore Kumar hook instead of the trending pop sound'")
    basis: list[str] = Field(description="1–2 names copied exactly from this city's lists that the touch stands on")


class CityPlan(BaseModel):
    region: str
    hook: str = Field(description="The first line or on-screen text that makes THIS city's viewers stop scrolling, under 12 words: a callout, a comparison or a question aimed at them")
    caption: str = Field(description="A caption for this city, 1–3 short lines, in the creator's voice; no hashtags in it")
    hashtags: list[str] = Field(description="6–8 hashtags people in this city actually search for this niche: city + niche combinations (#KolkataFoodie), the niche, and at most one or two built from a list name that fits the niche. Never a celebrity or brand tag that has nothing to do with the content. Each starts with #, no spaces")
    audio: str = Field(description="Sound direction from this city's music lists: an artist or genre to use or echo, and why it suits the content")
    touch: LocalTouch


class GrowOut(BaseModel):
    reply: str = Field(description="2–3 sentences to the creator, addressing them as 'you': where their content already lands, where to grow next and why, with the numbers given")
    cities: list[CityPlan]


SYSTEM = """You help a creator or small brand grow beyond their home city on Instagram, TikTok and YouTube Shorts.
You get what their content is about, how it scores in each city (Qloo taste fit 0–100) with the references that help or hurt, and for
each target city its Qloo taste lists: top artists, films, TV, brands, public figures, places and genres.
For EVERY target city write a hook, caption, hashtags, audio direction and one local touch.
Rules:
- Keep the creator's own niche and voice; this is the same creator reaching a new city, not a rebrand. Their content is still made
  where they live, so the hook and caption invite this city's viewers in: a "your city vs mine" comparison, a callout, a question,
  a collab or a visit episode. A local touch must be something they can do: from home, in a duet or collab, or on a visit (say which).
- Ground every specific name in that city's lists (audio, hashtags built from names, the local touch). basis names must be copied exactly.
- Write like a Gen Z creator: short, casual, no corporate words, no emoji spam (at most two).
- Never invent follower counts, trends, posting times or algorithm claims. No stereotypes or caricature.
- `reply` answers the user's request in plain words and quotes the fit numbers.
- Connect the signals: if the content's fans skew older or one gender away from the creator's audience, say so in `reply` and lean the
  hook and audio toward what that city's lists show for them; where fit is high, keep what already lands and only add the local touch."""


def _lists(p: dict) -> str:
    lines = [f"City: {p['city']}", "Genres: " + ", ".join(t["name"] for t in p["tags"])]
    for d in p["domains"]:
        lines.append(f"{d['label']}: " + "; ".join(i["name"] for i in d["items"]))
    return "\n".join(lines)


def _match(got: list[CityPlan], targets: list[str]) -> dict[str, CityPlan]:
    """Plans by target city; a plan whose region name doesn't match ("NYC", "Chi") takes the next unfilled target."""
    out: dict[str, CityPlan] = {}
    loose = []
    for c in got:
        name = regions.canonical(c.region)
        if name in targets and name not in out:
            out[name] = c
        else:
            loose.append(c)
    for t in targets:
        if t not in out and loose and len(got) == len(targets):
            out[t] = loose.pop(0)
    return out


async def grow(*, creative: dict | None, niche: str, home: str | None, targets: list[str], region_names: list[str], fits: dict[str, int],
               audience: str | None, brief: dict | None) -> dict:
    home = regions.canonical(home) if home else None
    targets = [regions.canonical(t) for t in targets if regions.canonical(t) != home][:3]
    names = list(dict.fromkeys([regions.canonical(n) for n in region_names] + targets + ([home] if home else [])))
    region_list = [r for r in await asyncio.gather(*[regions.resolve(n) for n in names]) if r]
    by_name = {r["name"]: r for r in region_list}
    targets = [t for t in targets if t in by_name]
    if not targets:
        return {"reply": "Qloo has no location data for those cities yet.", "cities": {}, "profiles": {}, "evidence": []}

    # Taste lists for home + targets (so what they all share drops out), and each target's local creators.
    profiled = list(dict.fromkeys(([home] if home in by_name else []) + targets))
    # Heroes: the content's main Qloo entities, the seeds for "what this content's fans also love" in each city.
    ranked = sorted((creative or {}).get("refs", []), key=lambda r: -intel.WEIGHT.get(r.get("prominence"), 2))
    heroes = list(dict.fromkeys(s["id"] for r in ranked if r.get("enabled") and r.get("kind") != "unmatched"
                                for s in r.get("signals") or [] if s["kind"] == "entity"))[:3]
    seed = {"signal.interests.entities": ",".join(heroes)} if heroes else {}

    async def deals(t: str):
        loc = regions.location_params(by_name[t])
        b, p = await asyncio.gather(qloo.insights({"filter.type": "urn:entity:brand", **loc, **seed, "take": 12}),
                                    qloo.insights({"filter.type": "urn:entity:podcast", **loc, **seed, "take": 8}))
        return {"brands": [intel._item(e) for e in b], "podcasts": [intel._item(e) for e in p]}

    profs, creators, reach, deal_lists, skew = await asyncio.gather(
        profile_agent.profiles(profiled, audience),
        asyncio.gather(*[ask_agent.local_creators(by_name[t], take=8, social_only=True) for t in targets]),
        asyncio.gather(*[ask_agent.local_creators(by_name[t], take=8, social_only=True, max_pop=0.6) for t in targets]),
        asyncio.gather(*[deals(t) for t in targets]),
        intel.skew_bundle(creative, audience or "18–24") if creative else asyncio.sleep(0, result=None),
    )
    # Brands and podcasts every target shares are generic: keep what is local to each city.
    by_city = {t: {**d, "places": [], "gems": [], "tv": []} for t, d in zip(targets, deal_lists)}
    intel.distinct(by_city, keep=4)

    refs = [r for r in (creative or {}).get("refs", []) if r.get("enabled") and r.get("kind") != "unmatched"]
    def ref_line(city: str) -> str:
        scored = sorted(((r["label"], r["scores"][city]) for r in refs if city in r.get("scores", {})), key=lambda x: -x[1])
        return ", ".join(f"{label} {s}" for label, s in scored) or "no scored references"

    content = (creative or {}).get("text") or niche
    fit_txt = "\n".join(f"- {c}: fit {fits.get(c, '?')} · references: {ref_line(c)}" for c in [*( [home] if home else []), *targets])
    skew_txt = ""
    if skew and skew.get("ad"):
        m = skew["target"]["match"]
        skew_txt = (f"WHO THE CONTENT'S FANS ARE (Qloo, aggregate): {intel.describe(skew['ad'])}"
                    + (f"; match with {audience or '18–24'}: {m:+.2f}" if m is not None else "") + "\n"
                    + "\n".join(f"  - {r['label']} (via {r['via']}): {intel.describe(r['skew'])}" for r in skew["refs"]) + "\n\n")
    prompt = (f"WHAT THEY POST: {niche}\nTHE CONTENT:\n{content[:1500]}\nHOME CITY: {home or 'unknown'}\nAUDIENCE: {audience or '18–24'}\n\n"
              f"{skew_txt}FIT BY CITY\n{fit_txt}\n\nTARGET CITIES\n" + "\n\n".join(_lists(profs[t]) for t in targets if t in profs))
    out = await gemini.json_call(GrowOut, SYSTEM, [prompt], temperature=0.7)

    scope, mult = regions.heat_scope(region_list)
    items_by_name = {i["name"].lower(): i for t in targets if t in profs for d in profs[t]["domains"] for i in d["items"]}
    tags_by_name = {x["name"].lower(): x for t in targets if t in profs for x in profs[t]["tags"]}
    evidence: list[dict] = []

    def score_row(sig: dict, cells: list) -> dict:
        return {rg["name"]: v for rg in region_list if (v := regions.score_in(cells, rg, mult)) is not None}

    async def touch_evidence(city: str, touch: LocalTouch) -> str | None:
        ents = [items_by_name[b.lower()] for b in touch.basis if b.lower() in items_by_name][:2]
        tgs = [tags_by_name[b.lower()] for b in touch.basis if b.lower() in tags_by_name][:2]
        sigs = [{"kind": "entity", **e} for e in ents] + [{"kind": "tag", "id": t["id"], "name": t["name"], "type": "urn:tag"} for t in tgs]
        if not sigs:
            return None
        cells = await asyncio.gather(*[qloo.heatmap(qloo.heat_params(s), scope) for s in sigs])
        ev = {
            "id": f"ev_{uuid.uuid4().hex[:10]}",
            "title": f"{city}: {touch.text[:60]}",
            "claim": f"{city}'s audience over-indexes on {', '.join(s['name'] for s in sigs)}, so this touch speaks to them. Numbers are Qloo heatmap affinity per city.",
            "entities": [{"name": s["name"], "type": s["type"], "id": s["id"], "byCity": score_row(s, cs)} for s, cs in zip(sigs, cells) if s["kind"] == "entity"],
            "tags": [{"name": s["name"], "id": s["id"]} for s in sigs if s["kind"] == "tag"],
            "tagScores": [{"name": s["name"], "id": s["id"], "byCity": score_row(s, cs)} for s, cs in zip(sigs, cells) if s["kind"] == "tag"],
            "calls": [qloo.call_string("/v2/insights", {"filter.type": s["type"] if s["kind"] == "entity" else "urn:tag", "signal.location.query": city}) for s in sigs]
            + [qloo.call_string("/v2/insights", {"filter.type": "urn:heatmap", **scope, **qloo.heat_params(s)}) for s in sigs],
        }
        evidence.append(ev)
        return ev["id"]

    async def creator_rows(city: str, people: list[dict], within: list[dict]) -> list[dict]:
        # The two biggest creators this city loves (to duet or stitch), plus up to three less famous ones (to pitch a collab).
        seen = set()
        pool = []
        for p, tier in [(p, "big") for p in people[:2]] + [(p, "reach") for p in within[:4]]:
            if p["id"] not in seen:
                seen.add(p["id"])
                pool.append({**p, "tier": tier})
        cells = await asyncio.gather(*[qloo.heatmap(qloo.heat_params(p), scope) for p in pool[:5]])
        rows = []
        for p, cs in zip(pool[:5], cells):
            by = score_row(p, cs)
            if city not in by:
                continue
            ev = {
                "id": f"ev_{uuid.uuid4().hex[:10]}",
                "title": f"Collab in {city}: {p['name']}",
                "claim": (p.get("about") or "A creator Qloo ranks among this city's top public figures.")
                + f" Qloo ranks creators by how much {city}'s audience likes them, not by niche: check they fit your content.",
                "entities": [{"name": p["name"], "type": p["type"], "id": p["id"], "byCity": by}],
                "tags": [], "tagScores": [],
                "calls": [qloo.call_string("/v2/insights", {"filter.type": "urn:entity:person", "signal.location.query": city, "take": 50}),
                          qloo.call_string("/v2/insights", {"filter.type": "urn:heatmap", **scope, **qloo.heat_params(p)})],
            }
            evidence.append(ev)
            rows.append({"name": p["name"], "id": p["id"], "about": p.get("about", ""), "score": by[city], "evidenceId": ev["id"],
                         "tier": p["tier"], "popularity": round(p["popularity"], 2) if p.get("popularity") is not None else None})
        return sorted(rows, key=lambda r: (r["tier"] != "reach", -r["score"]))[:5]

    plans = _match(out.cities, targets)
    missing = [t for t in targets if t not in plans]
    if missing:
        # The model skipped a city: ask again for just those.
        more = await gemini.json_call(GrowOut, SYSTEM, [prompt + f"\n\nWrite the plan ONLY for: {', '.join(missing)}."], temperature=0.7)
        plans.update({t: p for t, p in _match(more.cities, missing).items() if t not in plans})
    plans = {t: plans[t] for t in targets if t in plans}
    touch_ids, collab = await asyncio.gather(
        asyncio.gather(*[touch_evidence(t, p.touch) for t, p in plans.items()]),
        asyncio.gather(*[creator_rows(t, creators[targets.index(t)], reach[targets.index(t)]) for t in plans]),
    )

    def squash(x: str) -> str:
        return "".join(ch for ch in x.lower() if ch.isalnum())

    # Hashtags made of a celebrity's or brand's name pull the wrong crowd: keep at most one, the one the local touch stands on.
    list_names = {squash(i["name"]) for i in items_by_name.values()} | {squash(x["name"]) for x in tags_by_name.values()}

    cities: dict[str, dict] = {}
    for (t, p), evid, rows in zip(plans.items(), touch_ids, collab):
        basis = {squash(b) for b in p.touch.basis}
        tags, named = [], 0
        for h in p.hashtags:
            h = "#" + h.lstrip("#").replace(" ", "")
            key = squash(h)
            if len(key) < 2 or key in {squash(x) for x in tags}:
                continue
            if key in list_names:
                if key not in basis or named:
                    continue
                named += 1
            tags.append(h)
        tags = tags[:8]
        # Only names that are really in this city's Qloo lists go on the chips.
        known = [b for b in p.touch.basis if b.lower() in items_by_name or b.lower() in tags_by_name]
        d = by_city.get(t, {})
        deal_ev = None
        if d.get("brands") or d.get("podcasts"):
            picks = d["brands"][:4] + d["podcasts"][:3]
            ev = {"id": f"ev_{uuid.uuid4().hex[:10]}", "title": f"Brands and podcasts your fans love in {t}",
                  "claim": f"What fans of your content's main references in {t} over-index on (Qloo cross-domain affinity, 0–1). Pitch these brands for deals; guest on these podcasts.",
                  "entities": [{"name": i["name"], "type": i["type"], "id": i["id"], "byCity": {t: round((i["affinity"] or 0) * 100)}} for i in picks],
                  "tags": [], "tagScores": [],
                  "calls": [qloo.call_string("/v2/insights", {"filter.type": f, "signal.location.query": t, "signal.interests.entities": ",".join(heroes)}) for f in ("urn:entity:brand", "urn:entity:podcast")]}
            evidence.append(ev)
            deal_ev = ev["id"]
        cities[t] = {"hook": p.hook, "caption": p.caption, "hashtags": tags, "audio": p.audio,
                     "touch": {"text": p.touch.text, "basis": known, "evidenceId": evid}, "creators": rows,
                     "deals": {"brands": d.get("brands", [])[:4], "podcasts": d.get("podcasts", [])[:3], "evidenceId": deal_ev}}

    # Sensitivity check on everything that will be posted (never auto-approves; the UI shows flags).
    items = [{"id": t, "text": f"{v['hook']} | {v['caption']} | {' '.join(v['hashtags'])} | {v['touch']['text']}", "region": t} for t, v in cities.items()]
    flags = await sensitivity.check(items, brief)
    for t, f in flags.items():
        if t in cities:
            cities[t]["flag"] = {"reason": f["reason"], "safer": f["safer"]}

    if skew:
        evidence.extend(skew["evidence"])
    return {"reply": out.reply, "cities": cities, "profiles": {t: profs[t] for t in targets if t in profs}, "evidence": evidence,
            "skew": {k: v for k, v in skew.items() if k != "evidence"} if skew else None}
