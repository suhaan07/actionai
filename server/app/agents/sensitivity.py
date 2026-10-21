"""Sensitivity check (module 16). Flags for human review; never auto-approves."""
import json
from pathlib import Path
from typing import Optional

from pydantic import BaseModel

from .. import gemini
from ..regions import PRESETS, STATES

_LIST = json.loads((Path(__file__).resolve().parents[2] / "data" / "sensitivity.json").read_text(encoding="utf8"))


class Verdict(BaseModel):
    id: str
    flagged: bool
    category: Optional[str] = None
    reason: Optional[str] = None
    safer: Optional[str] = None


class Verdicts(BaseModel):
    items: list[Verdict]


SYSTEM = """You are the sensitivity reviewer for an ad team. For each item, decide whether it could backfire in its region.
Judge the text exactly as written for that region. Flag only real risks from the checklist; do not flag ordinary cultural references,
and never flag a line just because it uses or replaces another region's culture. Most items should NOT be flagged.
For a flagged item give: category, a one-sentence reason a reviewer can act on, and a safer alternative phrased so it can directly replace the risky part.
Be precise and calm. You are an assistant, not a certifier: unflagged does not mean safe."""


async def check(items: list[dict], brief: dict | None = None) -> dict[str, dict]:
    """items: [{id, text, region}] → {id: {reason, safer, category}} for flagged ones."""
    if not items:
        return {}
    regions = {i.get("region") for i in items if i.get("region")}
    countries = {PRESETS[r]["country"] for r in regions if r in PRESETS} | ({"India"} if any(r in STATES for r in regions) else set())
    # Known cities get their own notes; Indian states and unknown small places get the rural notes.
    regional = {r: _LIST["regional"].get(r) or ([] if r in PRESETS else _LIST["regional"]["rural"]) for r in regions}
    country_notes = "\n".join(f"{c}: {'; '.join(_LIST['countries'][c])}" for c in countries if c in _LIST["countries"])
    checklist = (
        "Checklist:\n- " + "\n- ".join(_LIST["global"])
        + (f"\n\nCountry notes:\n{country_notes}" if country_notes else "")
        + "\n\nRegional notes:\n" + "\n".join(f"{r}: {'; '.join(v)}" for r, v in regional.items() if v)
    )
    context = f"Campaign: {json.dumps({k: v for k, v in (brief or {}).items() if v})}\n\n" if brief else ""
    payload = "\n".join(f"[{i['id']}] region={i.get('region', '-')}: {i['text']}" for i in items)
    try:
        out = await gemini.json_call(Verdicts, SYSTEM, prefer="groq", parts=[f"{context}{checklist}\n\nITEMS\n{payload}"], temperature=0.1)
    except gemini.GeminiError:
        # Fail closed: if the check cannot run, every item needs a human look.
        return {i["id"]: {"category": "unchecked", "reason": "The sensitivity check could not run. Review this by hand before using it.", "safer": ""} for i in items}
    return {v.id: {"category": v.category or "", "reason": v.reason or "", "safer": v.safer or ""} for v in out.items if v.flagged}
