import hashlib
import json
import logging
import time
import uuid

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from . import cache, config, gemini, imagegen, qloo, regions, supa
from .agents import adapt as adapt_agent
from .agents import ask as ask_agent
from .agents import profile as profile_agent
from .agents import read as read_agent
from .agents import talk

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("api")

app = FastAPI(title="Action AI", version="0.2.0")
app.add_middleware(CORSMiddleware, allow_origins=config.ALLOWED_ORIGINS, allow_origin_regex=r"https://.*\.vercel\.app", allow_methods=["*"], allow_headers=["*"])

MAX_UPLOAD = 50 * 1024 * 1024


async def _memo(kind: str, payload, fn):
    """Same request in, same answer out: replays (like the guided demo) cost no Qloo or Gemini quota.
    Failures are never cached."""
    key = cache.key_for("api", kind, payload)
    hit = await cache.get(key)
    if hit is not None:
        return hit
    out = await fn()
    await cache.put(key, out)
    return out


def _fail(e: Exception, what: str):
    log.exception("%s failed", what)
    if isinstance(e, gemini.GeminiError):
        raise HTTPException(502, f"{what}: the language model is unavailable right now. Try again in a moment.")
    if isinstance(e, qloo.QlooError):
        raise HTTPException(502, f"{what}: Qloo did not respond. Try again in a moment.")
    raise HTTPException(500, f"{what} failed: {str(e)[:200]}")


@app.get("/health")
async def health(deep: bool = False):
    if deep:  # a real database read, so the free Supabase project counts as active
        await supa.select_one("qloo_cache", "key", "keepalive")
    return {
        "ok": True,
        "qloo": bool(config.QLOO_API_KEY),
        "gemini": bool(config.GEMINI_API_KEY),
        "images": bool(config.POLLINATIONS_API_KEY),
        "model": config.GEMINI_MODEL,
        "supabase": {"enabled": supa.enabled, "cache": await supa.table_ok("qloo_cache"), "campaigns": await supa.table_ok("campaigns")},
    }


# ── Router ──────────────────────────────────────────────

class UnderstandIn(BaseModel):
    text: str
    context: str = ""


@app.post("/api/understand")
async def understand(body: UnderstandIn):
    try:
        return await talk.understand(body.text, body.context)
    except Exception as e:
        _fail(e, "Understanding the request")


# ── Read + score ────────────────────────────────────────

@app.post("/api/read")
async def read(
    text: str = Form(""),
    caption: str = Form(""),
    name: str = Form(""),
    format: str = Form("script"),
    regions_json: str = Form("[]"),
    file: UploadFile | None = File(None),
):
    region_names = json.loads(regions_json) or talk.DEFAULT_SIX
    media = None
    stored = None
    if file is not None:
        data = await file.read()
        if len(data) > MAX_UPLOAD:
            raise HTTPException(413, "That file is over 50 MB. Trim the video or export a smaller version.")
        mime = file.content_type or "application/octet-stream"
        if mime.startswith(("video/", "image/", "audio/")) or mime == "application/pdf":
            media = (data, mime)
        else:
            text = (text + "\n" + data.decode("utf8", errors="ignore")).strip()
        stored = await supa.upload(f"{time.strftime('%Y%m%d')}/{hashlib.sha256(data).hexdigest()[:16]}-{file.filename}", data, mime)
    if not text and not media:
        raise HTTPException(400, "Attach a creative or paste a script.")
    fingerprint = {"text": text, "caption": caption, "name": name, "format": format, "regions": region_names,
                   "file": hashlib.sha256(media[0]).hexdigest() if media else None}
    try:
        out = await _memo("read:v2", fingerprint, lambda: read_agent.read_creative(
            text=text or None, media=media, caption=caption or None, name=name or (file.filename if file else None), fmt=format, region_names=region_names))
    except Exception as e:
        _fail(e, "Reading the ad")
    return {**out, "stored": stored}


class RescoreIn(BaseModel):
    refs: list[dict]
    regions: list[str]


@app.post("/api/rescore")
async def rescore(body: RescoreIn):
    try:
        return await read_agent.rescore(body.refs, body.regions)
    except Exception as e:
        _fail(e, "Scoring")


# ── Create / profiles ───────────────────────────────────

class ProfilesIn(BaseModel):
    regions: list[str]
    audience: str | None = None
    brief: dict = {}
    write: bool = False


@app.post("/api/profiles")
async def profiles(body: ProfilesIn):
    try:
        if body.write:
            return await _memo("create:v4", body.model_dump(), lambda: profile_agent.create(body.regions, body.audience, body.brief))
        return {"profiles": await profile_agent.profiles(body.regions, body.audience), "writes": {}, "evidence": []}
    except Exception as e:
        _fail(e, "Building city profiles")


# ── Test: personas ──────────────────────────────────────

class PersonasIn(BaseModel):
    region: str
    audience: str | None = None
    creative: dict


@app.post("/api/personas")
async def personas(body: PersonasIn):
    try:
        return await _memo("personas", body.model_dump(), lambda: talk.personas(body.region, body.audience, body.creative))
    except Exception as e:
        _fail(e, "Building the persona panel")


# ── Adapt ───────────────────────────────────────────────

class AdaptIn(BaseModel):
    creative: dict
    source: str | None = None
    target: str
    audience: str | None = None
    regions: list[str] = []
    brief: dict = {}
    instructions: str = ""
    locked: list[str] = []
    focus: str | None = None


@app.post("/api/adapt")
async def adapt(body: AdaptIn):
    try:
        return await _memo("adapt:v4", body.model_dump(), lambda: adapt_agent.adapt(
            creative=body.creative, source=body.source, target=body.target, audience=body.audience, region_names=body.regions, brief=body.brief,
            instructions=body.instructions, locked=body.locked, focus=body.focus))
    except Exception as e:
        _fail(e, "Adapting the ad")


# ── Follow-ups ──────────────────────────────────────────

class ExplainIn(BaseModel):
    question: str
    creative: dict | None = None
    extra: str = ""


@app.post("/api/explain")
async def explain(body: ExplainIn):
    try:
        return await _memo("explain", body.model_dump(), lambda: talk.explain(body.question, body.creative, body.extra))
    except Exception as e:
        _fail(e, "Answering")


class AskIn(BaseModel):
    question: str
    brief: dict = {}
    regions: list[str] = []
    audience: str | None = None


@app.post("/api/ask")
async def ask(body: AskIn):
    try:
        return await _memo("ask:v8", body.model_dump(), lambda: ask_agent.ask(body.question, body.brief, body.regions, body.audience))
    except Exception as e:
        _fail(e, "Answering from Qloo")


# ── Visual mock-ups ─────────────────────────────────────

class MockupIn(BaseModel):
    text: str
    city: str | None = None
    kind: str = "post"
    aspect: str = "4:5"


@app.post("/api/mockup")
async def mockup(body: MockupIn):
    if body.aspect not in imagegen.SIZES:
        raise HTTPException(400, "Unknown aspect ratio")
    try:
        prompt = await imagegen.scene_prompt(body.text, body.city, body.kind)
        name = await imagegen.render(prompt, body.aspect)  # type: ignore[arg-type]
    except imagegen.ImageGenError as e:
        raise HTTPException(502, str(e))
    except Exception as e:
        _fail(e, "Making the mock-up")
    return {"image": f"/api/images/{name}", "prompt": prompt}


@app.get("/api/images/{name}")
async def image(name: str):
    if not name.endswith(".jpg") or "/" in name or "\\" in name or ".." in name:
        raise HTTPException(404)
    path = imagegen.IMAGE_DIR / name
    if not path.exists():
        raise HTTPException(404)
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=31536000, immutable"})


# ── Regions ─────────────────────────────────────────────

@app.get("/api/regions/resolve")
async def resolve_region(q: str):
    r = await regions.resolve(q)
    if not r:
        raise HTTPException(404, f"Qloo has no location data for \"{q}\".")
    return r


@app.get("/api/regions/presets")
async def presets():
    return {"presets": [{"name": k, **v} for k, v in regions.PRESETS.items()], "markets": regions.MARKETS}


# ── Campaigns (shared links) ────────────────────────────

_campaign_dir = config.CACHE_DIR / "campaigns"
_campaign_dir.mkdir(parents=True, exist_ok=True)


@app.get("/api/campaigns/{cid}")
async def get_campaign(cid: str):
    row = await supa.select_one("campaigns", "id", cid)
    if row:
        return row["data"]
    f = _campaign_dir / f"{cid}.json"
    if f.exists():
        return json.loads(f.read_text(encoding="utf8"))
    raise HTTPException(404, "Campaign not found")


@app.put("/api/campaigns/{cid}")
async def put_campaign(cid: str, data: dict):
    if len(json.dumps(data)) > 4_000_000:
        raise HTTPException(413, "Campaign too large")
    ok = await supa.upsert("campaigns", {"id": cid, "data": data, "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
    if not ok:
        (_campaign_dir / f"{cid}.json").write_text(json.dumps(data), encoding="utf8")
    return {"ok": True, "stored": "supabase" if ok else "local"}


@app.post("/api/admin/recheck")
async def recheck():
    supa.reset_tables()
    return await health()
