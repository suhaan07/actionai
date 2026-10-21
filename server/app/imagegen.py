"""Visual mock-ups: turn an ad's text into one image prompt (Groq/Gemini), render it with Pollinations (FLUX).

Images carry no text: headlines and sponsor names are overlaid by the app, so they are always spelled right.
Every image is cached by its prompt on disk, so replays cost nothing.
"""
import hashlib
from typing import Literal
from urllib.parse import quote

import httpx
from pydantic import BaseModel, Field

from . import config, gemini

IMAGE_DIR = config.CACHE_DIR / "images"
IMAGE_DIR.mkdir(parents=True, exist_ok=True)

SIZES = {"4:5": (768, 960), "9:16": (720, 1280), "1:1": (896, 896), "16:9": (1152, 648)}

_client = httpx.AsyncClient(timeout=120, follow_redirects=True)


class ImageGenError(Exception):
    pass


class ScenePrompt(BaseModel):
    prompt: str = Field(description="One image prompt, 40–70 words: subject, setting, people, wardrobe, props, light, mood, camera")


SYSTEM = """You turn an ad (a script, a post brief, or a scene) into ONE prompt for a photorealistic image generator.
Pick the single most iconic frame. Describe the subject, setting, people (age range, wardrobe), props, lighting, mood and camera
(e.g. '35mm, shallow depth of field, golden hour'). Make the location's culture visible through concrete details.
Rules: no text, no letters, no logos, no brand names, no real celebrities' names. Never depict religious figures or idols next to a
product. Style: high-end advertising photography."""


async def scene_prompt(text: str, city: str | None, kind: str) -> str:
    where = f"The ad runs in {city}; set the scene there." if city else ""
    out = await gemini.json_call(ScenePrompt, SYSTEM, [f"KIND: {kind}\n{where}\nAD:\n{text[:2500]}"], temperature=0.3, prefer="groq")
    return out.prompt.strip()


async def render(prompt: str, aspect: Literal["4:5", "9:16", "1:1", "16:9"] = "4:5") -> str:
    """Returns the cache file name for the rendered image."""
    if not config.POLLINATIONS_API_KEY:
        raise ImageGenError("Image mock-ups need a Pollinations key: add POLLINATIONS_API_KEY to server/.env.")
    w, h = SIZES[aspect]
    full = f"{prompt}. Photorealistic advertising photograph, no text, no words, no logos, no watermark."
    name = hashlib.sha256(f"{config.POLLINATIONS_MODEL}|{w}x{h}|{full}".encode()).hexdigest()[:32] + ".jpg"
    path = IMAGE_DIR / name
    if path.exists():
        return name
    r = await _client.get(
        f"https://gen.pollinations.ai/image/{quote(full[:900], safe='')}",
        params={"model": config.POLLINATIONS_MODEL, "width": w, "height": h, "seed": 7, "nologo": "true"},
        headers={"Authorization": f"Bearer {config.POLLINATIONS_API_KEY}"},
    )
    ctype = r.headers.get("content-type", "")
    if r.status_code != 200 or not ctype.startswith("image/"):
        msg = r.text[:200] if "json" in ctype or "text" in ctype else f"HTTP {r.status_code}"
        raise ImageGenError(f"The image service declined: {msg}")
    path.write_bytes(r.content)
    return name
