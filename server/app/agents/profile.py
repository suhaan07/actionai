"""City taste profiles (Qloo) and the Create agent's writing (Gemini, grounded only in those profiles)."""
import asyncio
import uuid
from typing import Optional

from pydantic import BaseModel, Field

from .. import gemini, qloo, regions
from . import sensitivity

DOMAINS = [
    ("music", "Music", "urn:entity:artist"),
    ("film", "Film", "urn:entity:movie"),
    ("tv", "TV", "urn:entity:tv_show"),
    ("brands", "Brands", "urn:entity:brand"),
    ("people", "Public figures", "urn:entity:person"),
    ("places", "Places", "urn:entity:place"),
]
_SKIP_PLACE = ("hotel", "marriott", "taj ", "itc ", "airport", "hyatt", "leela", "oberoi", "radisson", "novotel", "hilton", "mall")


async def _insights_with_age(params: dict, age: str | None) -> list[dict]:
    if age:
        out = await qloo.insights({**params, "signal.demographics.age": age})
        if out:
            return out
    return await qloo.insights(params)


async def region_profile(region: str, audience: str | None) -> dict:
    age = qloo.age_param(audience)
    rr = await regions.resolve(region)
    loc = regions.location_params(rr) if rr else {"signal.location.query": region}

    async def domain(key, label, ftype):
        # City-level taste: the age filter pulls every city toward the same global hits, which hides what is local.
        items = await qloo.insights({"filter.type": ftype, **loc, "take": 12})
        if key == "places":
            items = [e for e in items if not any(s in e["name"].lower() for s in _SKIP_PLACE)]
        return {"key": key, "label": label, "type": ftype, "items": [{"id": e["id"], "name": e["name"], "type": ftype, "description": e.get("short_description") or e.get("description")} for e in items[:12]]}

    domains, music_tags, media_tags = await asyncio.gather(
        asyncio.gather(*[domain(*d) for d in DOMAINS]),
        qloo.insights({"filter.type": "urn:tag", "filter.tag.types": "urn:tag:genre:music", **loc, "take": 6}),
        qloo.insights({"filter.type": "urn:tag", "filter.tag.types": "urn:tag:genre:media", **loc, "take": 6}),
    )
    tags = [{"id": t["id"], "name": t["name"].strip()} for t in (music_tags + media_tags) if t.get("name")]
    return {"city": region, "domains": [d for d in domains if d["items"]], "tags": tags[:10]}


async def profiles(region_names: list[str], audience: str | None) -> dict[str, dict]:
    names = [regions.canonical(n) for n in region_names]
    got = await asyncio.gather(*[region_profile(n, audience) for n in names])
    if len(got) >= 3:
        # Drop what every region shares so each profile shows what is distinctive; keep the top 6 per domain.
        counts: dict[str, int] = {}
        for p in got:
            for d in p["domains"]:
                for i in d["items"]:
                    counts[i["id"]] = counts.get(i["id"], 0) + 1
        for p in got:
            for d in p["domains"]:
                local = [i for i in d["items"] if counts[i["id"]] < len(got)]
                d["items"] = (local if len(local) >= 3 else d["items"])[:6]
    else:
        for p in got:
            for d in p["domains"]:
                d["items"] = d["items"][:6]
    return dict(zip(names, got))


# ── Create: insights, routes, collabs, production brief ─────────

class Insight(BaseModel):
    text: str = Field(description="One true, slightly surprising sentence about this audience, grounded in the lists")
    basis: list[str] = Field(description="1–3 names copied exactly from this region's lists that support it")


class Route(BaseModel):
    title: str = Field(description="2–3 word route name")
    hook: str = Field(description="One-line hook")
    script: str = Field(description="One or two sentences describing the ad")
    insight: int = Field(description="0-based index of the insight it stands on")


class Production(BaseModel):
    music: str
    locations: str
    wardrobe: str


class RegionWrite(BaseModel):
    region: str
    insights: list[Insight]
    routes: list[Route]
    collab: str = Field(description="One co-branding or tie-in idea using a brand, film, show or artist from the lists")
    collab_basis: list[str] = Field(default_factory=list)
    production: Production


class Post(BaseModel):
    visual: str = Field(description="What the image or carousel shows: layout, subject, setting, colours")
    on_image_text: str = Field(description="Headline text on the image, short")
    caption: str
    hashtags: list[str]


class Reel(BaseModel):
    title: str
    hook: str = Field(description="What happens in the first 2 seconds to stop the scroll")
    shots: list[str] = Field(description="3–6 short shot beats, in order")
    audio: str = Field(description="Sound direction: music style or trending-audio type, grounded in the regions' music lists")
    on_screen_text: str
    length_seconds: int


class Master(BaseModel):
    title: str
    script: str = Field(description="One master ad script for the whole campaign, 6–9 short sentences, naming concrete cultural references (films, music styles, foods, places, festivals) so it can be tested per region")
    post: Optional[Post] = None
    reels: list[Reel] = Field(default_factory=list, description="Only when Reels are requested: 3 distinct Reel ideas, vertical 9:16, 15–30 seconds")


class CreateOut(BaseModel):
    reply: str = Field(default="", description="2–4 sentences answering the user's request directly. If there are CLAIM CHECKS, say plainly whether the data supports each claim, with the numbers, and what to do instead")
    regions: list[RegionWrite]
    master: Optional[Master] = Field(default=None, description="Only when the brief asks for a script or a social post")


CREATE_SYSTEM = """You are a cultural strategist at an ad agency. You get the brief and, for each region, Qloo taste data:
top artists, films, TV, brands, public figures, places and genre tags for the target audience in that region.
Write, for EVERY region:
- 3 insights: true, specific, slightly surprising things about that region's audience, contrasting it with the other regions.
- 3 creative routes, each standing on one insight.
- 1 collab idea and a production brief (music direction, locations, wardrobe).
Hard rules:
- Only use names that appear in that region's lists. `basis` names must be copied exactly.
- Never invent regional traits the data does not show. No stereotypes or caricature.
- If the brief is a social or cause campaign, write for awareness and dignity, not for selling.
- Never feature or name the brand's competitors; collab ideas must not involve them.
- Start with `reply`: answer the user's actual request in plain words. If CLAIM CHECKS show an assumption is wrong for a region, say so
  with the numbers and do NOT build the script on it; use what the region's lists show instead.
- The master script must name concrete references from the target regions' lists (artists, films, foods, places), never generic lines.
- The brief's `request` is what the user is asking for right now: answer THAT in `reply`, not a generic campaign summary.
- If the deliverables include reel, write 3 Reel ideas in `master.reels` (vertical, 15–30s, hook in the first 2 seconds, a native Reels
  feel, not a shrunk TV ad). They are different from the static post.
- If the brief's deliverables include a script or a social post, also write `master`: ONE master script for the whole campaign
  built for the stated audience (if the ad is for children, write for kids and the parents watching with them; keep it safe and
  age-appropriate), plus an Instagram post design when asked. The master script will be tested in every region and adapted where it
  fits weakly, so make its cultural references concrete and specific.
- Keep everything short and concrete."""


def _lists_for_prompt(p: dict) -> str:
    lines = [f"Region: {p['city']}", "Tags: " + ", ".join(t["name"] for t in p["tags"])]
    for d in p["domains"]:
        lines.append(f"{d['label']}: " + "; ".join(i["name"] for i in d["items"]))
    return "\n".join(lines)


async def create(region_names: list[str], audience: str | None, brief: dict) -> dict:
    profs = await profiles(region_names, audience)
    claims = brief.pop("claims", None) or []
    brief_txt = "\n".join(f"{k}: {v}" for k, v in brief.items() if v)
    data = "\n\n".join(_lists_for_prompt(p) for p in profs.values())
    checks_txt, claim_evidence = await _check_claims(claims, list(profs))
    prompt = f"BRIEF\n{brief_txt}\n\nQLOO TASTE DATA\n{data}" + (f"\n\nCLAIM CHECKS (Qloo heatmap affinity, 0–100)\n{checks_txt}" if checks_txt else "")
    out = await gemini.json_call(CreateOut, CREATE_SYSTEM, [prompt], temperature=0.7)

    region_list = [r for r in await asyncio.gather(*[regions.resolve(n) for n in profs]) if r]
    by_name = {i["name"].lower(): i for p in profs.values() for d in p["domains"] for i in d["items"]}
    tag_by_name = {t["name"].lower(): t for p in profs.values() for t in p["tags"]}

    evidence: list[dict] = []
    writes: dict[str, dict] = {}

    async def ev_for(region: str, title: str, claim: str, basis: list[str]) -> str:
        ents = [by_name[b.lower()] for b in basis if b.lower() in by_name][:3]
        tgs = [tag_by_name[b.lower()] for b in basis if b.lower() in tag_by_name][:3]
        sigs = [{"kind": "entity", "id": e["id"], "name": e["name"], "type": e["type"]} for e in ents] + [{"kind": "tag", "id": t["id"], "name": t["name"], "type": "urn:tag"} for t in tgs]
        scope, mult = regions.heat_scope(region_list)
        cells = await asyncio.gather(*[qloo.heatmap(qloo.heat_params(s), scope) for s in sigs])
        ev = {
            "id": f"ev_{uuid.uuid4().hex[:10]}",
            "title": title,
            "claim": claim,
            "entities": [],
            "tags": [{"name": t["name"], "id": t["id"]} for t in tgs],
            "tagScores": [],
            "calls": [qloo.call_string("/v2/insights", {"filter.type": "urn:entity:artist", "signal.location.query": region}), qloo.call_string("/v2/insights", {"filter.type": "urn:tag", "signal.location.query": region})],
        }
        for s, cs in zip(sigs, cells):
            by = {r["name"]: v for r in region_list if (v := regions.score_in(cs, r, mult)) is not None}
            row = {"name": s["name"], "type": s["type"], "id": s["id"], "byCity": by}
            (ev["entities"] if s["kind"] == "entity" else ev["tagScores"]).append(row)
            ev["calls"].append(qloo.call_string("/v2/insights", {"filter.type": "urn:heatmap", **scope, **qloo.heat_params(s)}))
        evidence.append(ev)
        return ev["id"]

    jobs = []
    for w in out.regions:
        name = regions.canonical(w.region)
        if name not in profs:
            continue
        writes[name] = {"insights": [], "routes": [r.model_dump() for r in w.routes[:3]], "collab": w.collab, "production": w.production.model_dump()}
        for i, ins in enumerate(w.insights[:3]):
            writes[name]["insights"].append({"text": ins.text, "basis": ins.basis, "evidenceId": None})
            jobs.append((name, i, ev_for(name, f"{name}: insight {i + 1}", ins.text, ins.basis)))
    ids = await asyncio.gather(*[j[2] for j in jobs])
    for (name, i, _), evid in zip(jobs, ids):
        writes[name]["insights"][i]["evidenceId"] = evid

    # Sensitivity check on every route (never auto-approves; the UI shows flags)
    items = [{"id": f"{n}:{k}", "text": f"{r['title']}: {r['hook']} {r['script']}", "region": n} for n, w in writes.items() for k, r in enumerate(w["routes"])]
    flags = await sensitivity.check(items, brief)
    for n, w in writes.items():
        for k, r in enumerate(w["routes"]):
            if f"{n}:{k}" in flags:
                r["flag"] = flags[f"{n}:{k}"]

    wanted = str(brief.get("deliverables", ""))
    master = out.master.model_dump() if out.master and any(k in wanted for k in ("script", "social_post", "reel")) else None
    if master and "reel" not in wanted:
        master["reels"] = []
    if master:
        mitems = [{"id": "master", "text": master["script"], "region": ""}]
        if master.get("post"):
            mitems.append({"id": "post", "text": f"{master['post']['on_image_text']} | {master['post']['caption']}", "region": ""})
        mflags = await sensitivity.check(mitems, brief)
        master["flag"] = mflags.get("master")
        if master.get("post"):
            master["post"]["flag"] = mflags.get("post")
    evidence.extend(claim_evidence)
    return {"profiles": profs, "writes": writes, "evidence": evidence, "master": master, "reply": out.reply, "replyEvidence": [e["id"] for e in claim_evidence]}


async def _check_claims(claims: list[dict], region_names: list[str]) -> tuple[str, list[dict]]:
    """Score each assumption the user made with Qloo, in their regions plus the market's other cities for contrast."""
    from . import read as read_agent

    if not claims:
        return "", []
    resolved = [r for r in await asyncio.gather(*[regions.resolve(n) for n in region_names]) if r]
    country = next((r.get("country") for r in resolved if r.get("country")), None)
    compare = list(dict.fromkeys(region_names + [c for c in regions.MARKETS.get(country or "", []) if c not in region_names]))[:6]
    region_list = [r for r in await asyncio.gather(*[regions.resolve(n) for n in compare]) if r]
    lines, evidence = [], []
    for cl in claims[:3]:
        qtype = cl.get("qloo_type") or "none"
        sig = await read_agent._resolve_named(cl["thing"], qtype if qtype != "none" else "music_genre")
        if not sig:
            lines.append(f"- \"{cl['thing']}\": Qloo has no data for this, so it can't be checked.")
            continue
        totals, per = await read_agent.score_signals([sig], region_list)
        nums = ", ".join(f"{k} {v}" for k, v in sorted(totals.items(), key=lambda kv: -kv[1]))
        lines.append(f"- \"{cl['thing']}\" (Qloo: {sig['name']}): {nums}")
        p = per[0]
        evidence.append({
            "id": f"ev_{uuid.uuid4().hex[:10]}",
            "title": f"Claim check: {cl['thing']}",
            "claim": f"You assumed {', '.join(cl.get('regions') or region_names)} would love \"{cl['thing']}\". This is how strongly each city's audience over-indexes on it.",
            "entities": [{"name": p["name"], "type": p["type"], "id": p["id"], "byCity": p["byCity"]}] if p["kind"] == "entity" else [],
            "tags": [{"name": p["name"], "id": p["id"]}] if p["kind"] == "tag" else [],
            "tagScores": [{"name": p["name"], "id": p["id"], "byCity": p["byCity"]}] if p["kind"] == "tag" else [],
            "calls": [qloo.call_string("/v2/insights", {"filter.type": "urn:heatmap", **p.get("scope", {}), **qloo.heat_params(p)})],
        })
    return "\n".join(lines), evidence
