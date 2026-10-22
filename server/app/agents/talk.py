"""Personas, follow-up answers, and the router's language understanding."""
import asyncio
from typing import Literal, Optional

from pydantic import BaseModel, Field

from .. import gemini, qloo, regions

# ── Persona panel ───────────────────────────────────────────

_BAND_LABEL = {"24_and_younger": "22", "25_to_29": "27", "30_to_34": "32", "35_to_44": "39", "45_to_54": "49", "55_and_older": "60"}


class Reaction(BaseModel):
    index: int
    reaction: str = Field(description="One or two sentences in the persona's own voice, first person, reacting to the ad")


class Reactions(BaseModel):
    items: list[Reaction]


PERSONA_SYSTEM = """You voice simulated audience personas for an ad pre-test. Each persona is a Qloo taste cluster: an age and gender band
in a region, with the artists, films and genres that band over-indexes on. React to the ad as that person would, in plain everyday
language, in one or two sentences. Only mention things from the persona's own list or the ad. These are simulations, not real people."""


async def personas(region: str, audience: str | None, creative: dict) -> dict:
    region = regions.canonical(region)
    buckets = (qloo.age_param(audience) or "25_to_29,30_to_34").split(",")
    bands = [(buckets[0], "female"), (buckets[min(1, len(buckets) - 1)], "male"), (buckets[-1], "female")]
    rr = await regions.resolve(region)
    loc = regions.location_params(rr) if rr else {"signal.location.query": region}

    async def cluster(age: str, gender: str):
        p = {**loc, "signal.demographics.age": age, "signal.demographics.gender": gender}
        a, m, t = await asyncio.gather(
            qloo.insights({"filter.type": "urn:entity:artist", **p, "take": 3}),
            qloo.insights({"filter.type": "urn:entity:movie", **p, "take": 2}),
            qloo.insights({"filter.type": "urn:tag", "filter.tag.types": "urn:tag:genre:music", **p, "take": 2}),
        )
        return {"band": f"{_BAND_LABEL.get(age, age)} · {gender[0].upper()}", "age": age, "gender": gender, "likes": [e["name"] for e in a + m], "tags": [x["name"].strip() for x in t]}

    clusters = await asyncio.gather(*[cluster(a, g) for a, g in bands])
    refs = "; ".join(f"{r['label']} (fit {r['scores'].get(region, '?')})" for r in creative["refs"] if r.get("enabled"))
    lines = "\n".join(f"[{i}] {c['band']} in {region}. Loves: {', '.join(c['likes'])}. Genres: {', '.join(c['tags'])}" for i, c in enumerate(clusters))
    out = await gemini.json_call(Reactions, PERSONA_SYSTEM, prefer="groq", parts=[f"THE AD\n{creative['text']}\nReferences and their Qloo fit in {region}: {refs}\n\nPERSONAS\n{lines}"], temperature=0.8)
    by = {r.index: r.reaction for r in out.items}
    return {"city": region, "personas": [{**c, "reaction": by.get(i, "")} for i, c in enumerate(clusters)]}


# ── Follow-up answers ───────────────────────────────────────

class Answer(BaseModel):
    text: str = Field(description="Two to four sentences answering the question from the data")
    ref_ids: list[str] = Field(default_factory=list, description="ids of the references the answer relies on")


EXPLAIN_SYSTEM = """You answer an ad team's follow-up question about results already on screen. Use only the data given: Qloo fit scores per
region for each reference. Be specific with numbers. If the data cannot answer it, say what to run instead. Never claim ROAS or A/B results."""


async def explain(question: str, creative: dict | None, extra: str = "") -> dict:
    if not creative:
        return {"text": "Nothing to explain yet. Run an agent first.", "ref_ids": []}
    data = "\n".join(f"- id={r['id']} {r['label']} ({r['role']}): {r.get('scores', {})}" for r in creative["refs"] if r.get("enabled"))
    out = await gemini.json_call(Answer, EXPLAIN_SYSTEM, prefer="groq", parts=[f"QUESTION: {question}\n\nAD: {creative['name']}\n{creative['text']}\n\nREFERENCES (scores 0–100 by region)\n{data}\n{extra}"], temperature=0.3)
    return out.model_dump()


# ── Router language understanding ───────────────────────────

class AskOption(BaseModel):
    label: str
    value: str = Field(description="Machine value: a region name, an age range like '25–44', a rupee amount like '200000', or an agent id")
    hint: Optional[str] = None


class Ask(BaseModel):
    field: Literal["cities", "audience", "budget", "sourceCity", "intent"]
    prompt: str = Field(description="The question, in the user's own terms (mention their product or goal)")
    options: list[AskOption] = Field(description="2–6 concrete options specific to this request, recommended first")
    multi: bool = False
    recommended: list[str] = Field(description="Option values the agent would pick if the user says 'auto-answer'")


class Claim(BaseModel):
    thing: str = Field(description="What the user assumes the audience loves, e.g. 'Hindi songs', 'cricket', 'Shah Rukh Khan'")
    qloo_type: Literal["artist", "movie", "tv_show", "brand", "person", "music_genre", "none"]
    regions: list[str] = Field(default_factory=list)


class Understanding(BaseModel):
    intents: list[Literal["create", "test", "adapt", "spend", "grow", "deep"]] = Field(description="Every agent needed, in order. create=write ideas/scripts/posts from a brief, test=score ads per region, adapt=make an ad fit other regions, spend=split a budget, grow=a creator or small brand growing their own social reach into new cities, deep=a deep dive on an ad: who it really reaches, partners and media to buy, venues, competitors")
    interest: Optional[str] = Field(default=None, description="If the product or creator targets a hobby, cause or interest community, the closest name from AUDIENCES, copied exactly (skincare → 'Health And Beauty', sneakers → 'Sneakerheads', a climate campaign → 'Climate Activism'). Null if none fits")
    explain: bool = Field(description="True only for a follow-up question about results already produced (why did X score low, what is dragging it), not a new task")
    ask: bool = Field(default=False, description="True for a question to answer from taste data that is not one of the four tasks, e.g. who could be our brand ambassador, which films could we tie in with, what do parents in Pune watch")
    deliverables: list[Literal["script", "social_post", "reel", "video", "ideas"]] = Field(default_factory=list, description="What THIS message asks Create to produce: an ad script, an Instagram/Facebook post design (social_post), Reel or short-video ideas (reel)")
    ask_question: Optional[str] = Field(default=None, description="If the message ALSO contains a lookup question taste data can answer (e.g. 'which Instagram creators can I target?'), that question, copied verbatim")
    regions: list[str] = Field(description="Cities, towns, districts or states the user names, anywhere in the world. 'all cities' means the default cities of the market. Empty if none named")
    source_region: Optional[str] = Field(default=None, description="Where an existing ad already works, if stated (e.g. 'this Delhi ad')")
    budget: Optional[float] = Field(default=None, description="Total budget as a plain number in its currency (2L = 200000, 1Cr = 10000000, $50k = 50000, £1.2m = 1200000)")
    currency: Optional[Literal["INR", "USD", "GBP", "EUR"]] = Field(default=None, description="Currency of the budget, if one is given")
    market: Optional[str] = Field(default=None, description="The country the campaign runs in, if clear from the regions or the request, e.g. 'India', 'United States', 'United Kingdom'")
    audience: Optional[str] = Field(default=None, description="Age range Qloo can profile, 18+ only, like '25–44'. For children's products use the parents' range '25–44'")
    audience_note: Optional[str] = Field(default=None, description="Who the ad is really for, in words, e.g. 'children 6–12; parents buy'")
    product: Optional[str] = Field(default=None, description="Product or cause, e.g. 'chips with a toy inside'")
    brand: Optional[str] = None
    competitors: list[str] = Field(default_factory=list)
    campaign_type: Literal["product", "cause"] = "product"
    is_script: bool = Field(description="True if the message itself contains an ad script or ad copy to analyse")
    script_text: Optional[str] = Field(default=None, description="If is_script: the ad script or copy only, copied verbatim, without the user's instruction around it")
    rural: bool = False
    claims: list[Claim] = Field(default_factory=list, description="Assumptions the user states about what an audience likes, to be checked with data. 'make it for Chennai with Hindi songs, they'll love it' → [{thing: 'Hindi songs', qloo_type: 'music_genre', regions: ['Chennai']}]")
    constraints: list[str] = Field(default_factory=list, description="Elements that must NOT change: sponsors, logos, mandatory lines, and anything the user wants to keep ('I want cricket only' → ['cricket'], 'keep the beach scene' → ['beach scene'], 'don't touch the tagline' → ['tagline'])")
    focus: Optional[str] = Field(default=None, description="What the user wants changed IN THE AD, only when they name it: an element ('the lantern on the left side of the image') or aspects ('the music and the styling'). Never a city or region; 'make it work in Miami' has no focus")
    questions: list[Ask] = Field(default_factory=list, description="At most 3 clarifying questions, only for missing information the requested agents need")


UNDERSTAND_SYSTEM = """You route requests for Action AI, a tool for ad teams and creators in any market:
Create (writes insights, ad scripts and social post designs from a brief), Test (scores ads per region with Qloo taste data),
Adapt (makes an ad fit other regions), Spend (splits a budget across regions), and Grow (for creators and small brands with no
media team: which cities their own Reels, posts or channel will land in next, with a caption, hashtags and local collabs per city).
DEEP: "deep dive", "who does this ad really reach / speak to", "which podcasts or shows should we sponsor", "who should we partner
with", "where in the city should we do pop-ups", "how do we stack up against <competitor>" → intents ['deep'] (it needs an ad; if
none exists yet it is read and tested first). Put competitor names in competitors.
GROW RULE (check this first): when someone describes what THEY make or post (Reels, TikToks, vlogs, a page, a channel) and asks
where else it would land, which cities would like it, or how to grow or reach more people, intents is ['grow'] and ask is false.
e.g. "I make street food Reels in Delhi. Which cities would love my content next?" → intents ['grow'], source_region 'Delhi',
regions ['Delhi'], market 'India', ask false. A city they say they're from or post in is source_region (and in regions).
If they name the cities to check ("will my Reel land in Pune and Hyderabad?"), that is test, not grow: grow is for finding where.
Grow never needs a budget, audience or region question unless the market is unknown.

Extract the fields. Choose every intent the user asks for, in order; a request to write an ad and then test it is create + test.
When adapting, anything the user wants kept goes in constraints, and the parts they want changed go in focus.
constraints, focus, claims, deliverables and ask_question come ONLY from the USER message itself; earlier messages are context for
what "this" or "it" refers to, never a source of new instructions.
A message can do both: a task (intents) plus a lookup question (ask=true with ask_question), e.g. "give me reel ideas and which
creators can I target?" → intents ['create'], deliverables ['reel'], ask=true, ask_question 'which creators can I target?'.
Launching a product, planning a campaign, or asking where to start ("we're launching X, where should we start?") is create, not ask.
ask=true is only for a specific lookup that taste data answers directly (who could be our ambassador, which films to tie in with,
what an audience in a named place listens to), with no intents. For ask, still add a regions question if no place or market is known.
Do not invent regions; for villages or rural areas return the named districts or states.

Then write clarifying questions, at most 3, ONLY for information that is missing and needed:
- regions: if test, adapt, spend or create is requested and no region is named. Offer a multi-select set of major cities IN THE MARKET
  the request points to (India: Delhi, Mumbai, Chennai, Bengaluru, Kolkata, Lucknow; United States: New York, Los Angeles, Chicago,
  Houston, Atlanta, Miami; United Kingdom: London, Manchester, Birmingham, Glasgow, Bristol; or that country's own major cities).
  If the market is unknown, ask which market instead, with options like 'India's six metros', 'Six major US cities', 'UK cities', and
  values that list the cities comma-separated.
- audience: Qloo only has adult taste data (18+). If the product is for children or teens, ask who to profile, e.g.
  'Parents who buy it (25–44)' recommended, 'Young adults and older siblings (18–24)', 'Both (18–44)'. If adults are named, don't ask.
- budget: only if spend is requested and no amount is given; offer 3–4 amounts that fit the scale described.
- sourceCity: only if adapting an existing ad whose home region is unclear.
Never ask for something already stated or that Create will produce (if the user wants an ad written, never ask which ad to use).
Phrase questions in the user's terms (name their product). Put the recommended option first."""

DEFAULT_SIX = regions.MARKETS["India"]


def _regions(raw: list[str], market: str | None = None) -> list[str]:
    rs: list[str] = []
    defaults = regions.MARKETS.get(market or "", DEFAULT_SIX)
    for r in raw:
        if not r:
            continue
        if r.lower().startswith(("all ", "every", "six ")) or r.lower() in ("all", "metros"):
            rs += defaults
        else:
            rs.append(regions.canonical(r))
    return list(dict.fromkeys(rs))


async def understand(text: str, context: str) -> dict:
    from . import intel

    names = [a["name"] for a in await intel.audience_list()]
    out = await gemini.json_call(Understanding, UNDERSTAND_SYSTEM, prefer="groq",
                                 parts=[f"AUDIENCES: {', '.join(names)}\n\nCAMPAIGN SO FAR: {context}\n\nUSER: {text}"], temperature=0.0)
    d = out.model_dump()
    if d.get("interest") and d["interest"] not in names:
        d["interest"] = None
    d["market"] = regions.canonical_country(d.get("market"))
    d["regions"] = _regions(d["regions"], d["market"])
    # A focus names what to change in the ad, never a place: "make it work in Miami" has no focus.
    f = (d.get("focus") or "").strip()
    places = {r.lower() for r in d["regions"]} | {p.lower() for p in regions.PRESETS} | {s.lower() for s in regions.STATES}
    if f and (f.lower() in places or regions.canonical(f).lower() in places or f.lower().removeprefix("the ").strip() in places):
        d["focus"] = None
    if not d["market"]:
        known = {regions.PRESETS[r]["country"] for r in d["regions"] if r in regions.PRESETS}
        d["market"] = known.pop() if len(known) == 1 else None
    if d.get("source_region"):
        d["source_region"] = regions.canonical(d["source_region"])
        if "adapt" in d["intents"]:
            d["regions"] = [r for r in d["regions"] if r != d["source_region"]]
    for q in d["questions"]:
        if q["field"] == "cities":
            q["multi"] = True
            for o in q["options"]:
                v = o["value"].strip()
                # "All metros" style options carry the whole list, comma-separated
                if v.lower().startswith(("all", "every", "six")):
                    o["value"] = ",".join(regions.MARKETS.get(d["market"] or "", DEFAULT_SIX))
                elif "," in v:
                    o["value"] = ",".join(regions.canonical(x) for x in v.split(",") if x.strip())
                else:
                    o["value"] = regions.canonical(v)
            rec = [v for v in q["recommended"] if not v.lower().startswith(("all", "every"))]
            q["recommended"] = [",".join(regions.canonical(x) for x in v.split(",")) for v in rec] or [q["options"][0]["value"]] if q["options"] else []
    return d
