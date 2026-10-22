"""Adapt: for each weak reference, find what holds the same cultural slot in the target region.

Named references (an artist, a film) swap for a Qloo entity the target region over-indexes on.
Concepts (a wedding, a street-food run) swap for a local concept that Gemini writes, but it must be anchored
to 1–2 entities from the target region's Qloo lists, and the swap is scored on those anchors.
"""
import asyncio
import logging
import uuid

from pydantic import BaseModel, Field

from .. import gemini, qloo, regions
from . import sensitivity

log = logging.getLogger("adapt")

NAMED_TYPES = {"artist", "movie", "tv_show", "brand", "person", "book", "podcast", "video_game"}
_CONCEPT_POOL = [("movie", 8), ("tv_show", 5), ("brand", 6), ("artist", 5)]


class Pick(BaseModel):
    ref_id: str
    anchor_ids: list[str] = Field(description="1–2 candidate ids. For a named reference, the single replacement entity. For a concept, the entities that best embody the replacement idea. Empty if nothing fits")
    replacement: str = Field(description="Words that replace the reference's exact text in the line, fitting the sentence grammatically")
    why: str = Field(description="One or two sentences on why this fills the same cultural slot in the target region, citing the anchors")


class Picks(BaseModel):
    reply: str = Field(default="", description="2–3 sentences answering the user's request directly: confirm what stays unchanged, then answer their specific question")
    picks: list[Pick]


SYSTEM = """You transcreate ads between regions. For each reference you get the line it sits in, its cultural slot (role),
and candidates from Qloo: entities and genre tags the TARGET region's audience over-indexes on.
- NAMED reference (a specific artist, film, brand): pick ONE candidate that fills the same slot and name it in the replacement.
- CONCEPT reference (a celebration, a food ritual, a setting): write the local equivalent idea in your own words
  (e.g. a North Indian wedding sangeet → a festival morning at home), then pick 1–2 candidates that genuinely embody that idea for this
  audience: prefer films, shows and brands; use a music genre only for music or dance. Use different anchors for different references.
  The replacement does not have to name the anchors.
Return exactly one pick for EVERY reference listed, using its [ref id].
If the user wrote a request, follow it: never change anything listed as LOCKED (sponsors, logos, mandatory lines), work on the element
they point to, and answer them in `reply` in plain words.
Rules: only use candidate ids given; keep the tone and length of the original words; never caricature; leave anchor_ids empty if
nothing fits. Avoid putting religious imagery next to a product."""


def _row(e: dict, kind: str, typ: str) -> dict:
    return {"id": e["id"], "name": e["name"].strip(), "kind": kind, "type": typ, "about": (e.get("short_description") or e.get("description") or "")[:140]}


async def _pool(loc: dict, age: str | None) -> dict[str, list[dict]]:
    """Target region's top entities per type plus music genres (shared across all references)."""

    async def ents(t: str, take: int):
        # City-level taste: age-filtered lists drift to the same global hits in every city.
        out = await qloo.insights({"filter.type": f"urn:entity:{t}", **loc, "take": take})
        return [_row(e, "entity", f"urn:entity:{t}") for e in out]

    async def genres():
        out = await qloo.insights({"filter.type": "urn:tag", "filter.tag.types": "urn:tag:genre:music", **loc, "take": 8})
        return [_row(t, "tag", "urn:tag:genre:music") for t in out if t.get("id")]

    types = ["artist", "movie", "tv_show", "brand", "person"]
    results = await asyncio.gather(*[ents(t, 10) for t in types], genres())
    pool = dict(zip(types, results[:-1]))
    pool["music_genre"] = results[-1]
    return pool


def _candidates(ref: dict, pool: dict[str, list[dict]]) -> list[dict]:
    qtype = ref.get("qlooType") or "none"
    if qtype == "music_genre":
        return pool["music_genre"] + pool["artist"][:6]
    if qtype in NAMED_TYPES:
        return pool.get(qtype, [])[:10]
    out = []
    for t, n in _CONCEPT_POOL:
        out += pool.get(t, [])[:n]
    role = (ref.get("role") or "").lower()
    return out + (pool["music_genre"][:4] if any(w in role for w in ("music", "dance", "song")) else [])


def _line_of(text: str, phrase: str) -> str:
    for part in text.replace("\n", " ").split(". "):
        if phrase.lower() in part.lower():
            return part.strip()
    return phrase


_POSITIONAL = {"the", "a", "an", "on", "in", "of", "at", "to", "for", "left", "right", "top", "bottom", "side", "corner", "image", "post",
               "ad", "frame", "background", "foreground", "there", "this", "that", "middle", "center", "centre", "hand", "what", "can", "we", "change"}


# Aspects people name ("the music", "the styling") map onto the words references actually use.
_ASPECTS = {
    "music": {"music", "song", "songs", "track", "soundtrack", "audio", "beat", "anthem", "genre", "singer", "band", "dance"},
    "styling": {"styling", "style", "fashion", "outfit", "outfits", "clothing", "clothes", "wardrobe", "attire", "dress", "costume", "look"},
    "food": {"food", "snack", "snacks", "dish", "meal", "cuisine", "drink", "stall"},
    "setting": {"setting", "location", "venue", "backdrop"},
}


def _words(s: str) -> set[str]:
    words = {w for w in "".join(ch.lower() if ch.isalnum() else " " for ch in s).split() if len(w) > 2 and w not in _POSITIONAL}
    for group in _ASPECTS.values():
        if words & group:
            words |= group
    return words


def _matches(ref: dict, terms: list[str]) -> bool:
    hay = _words(f"{ref.get('label', '')} {ref.get('text', '')} {ref.get('role', '')}")
    return any(_words(t) & hay for t in terms if t)


async def _focus_ref(focus: str, creative: dict, region_list: list[dict]) -> dict | None:
    """The user named an element the reader didn't list: describe it as a cue and score it with Qloo now."""
    from . import read as read_agent

    cue = await gemini.json_call(
        read_agent.Cue,
        read_agent.SYSTEM,
        [f"The ad: {creative['name']}\n{creative['text']}\n\nDescribe ONLY this one element of it as a cue: {focus}. Use its own words for `text`."],
        temperature=0.2,
        prefer="groq",
    )
    signals = await read_agent.resolve_cue(cue)
    if not signals:
        return None
    totals, _ = await read_agent.score_signals(signals, region_list)
    return {
        "id": f"ref_{uuid.uuid4().hex[:10]}", "cueId": cue.role, "text": cue.text or cue.label, "label": cue.label, "role": cue.role,
        "source": cue.source, "at": cue.at, "kind": "proxy" if cue.kind == "concept" else ("tag" if signals[0]["kind"] == "tag" else "entity"),
        "qlooId": signals[0]["id"], "qlooType": cue.qloo_type, "prominence": "support", "enabled": True, "scores": totals,
        "signals": [{"kind": s["kind"], "id": s["id"], "name": s["name"], "type": s["type"]} for s in signals], "evidenceId": "",
    }


async def adapt(*, creative: dict, source: str | None, target: str, audience: str | None, region_names: list[str], brief: dict | None,
                instructions: str = "", locked: list[str] | None = None, focus: str | None = None) -> dict:
    target = regions.canonical(target)
    locked = [x for x in (locked or []) if x.strip()]
    names = list(dict.fromkeys([regions.canonical(n) for n in region_names] + [target] + ([regions.canonical(source)] if source else [])))
    region_list = [r for r in await asyncio.gather(*[regions.resolve(n) for n in names]) if r]
    age = qloo.age_param(audience)

    usable = [r for r in creative["refs"] if r.get("enabled") and r.get("kind") != "unmatched" and not _matches(r, locked)]
    new_refs: list[dict] = []
    if focus:
        weak = [r for r in usable if _matches(r, [focus])]
        if not weak:
            made = await _focus_ref(focus, creative, region_list)
            if made:
                new_refs.append(made)
                weak = [made]
    else:
        # Weak in the target, or naming the source city outright (a "Nashville honky-tonk" never belongs in a Miami cut).
        home = (source or "").lower()
        src = regions.canonical(source) if source else None

        def is_weak(r: dict) -> bool:
            sc = r.get("scores", {})
            there = sc.get(target, 100)
            # Weak in the target outright, or clearly a home-city reference: 15+ points lower than where the ad was made.
            gap = (sc.get(src, there) - there) if src and src != target else 0
            names_home = home and home != target.lower() and home in f"{r.get('text', '')} {r.get('label', '')}".lower()
            return there < 65 or gap >= 15 or bool(names_home)

        weak = [r for r in usable if is_weak(r)]
    if not weak:
        note = f"Keeping {', '.join(locked)} as they are. " if locked else ""
        msg = f"I couldn't find \"{focus}\" as something Qloo can score." if focus else f"Nothing else scores under 65 in {target}, so there is nothing to swap."
        return {"swaps": [], "evidence": [], "reply": note + msg, "newRefs": []}

    tr = await regions.resolve(target)
    pool = await _pool(regions.location_params(tr) if tr else {"signal.location.query": target}, age)
    cands = {r["id"]: _candidates(r, pool) for r in weak}
    by_id = {c["id"]: c for cs in cands.values() for c in cs}

    blocks = []
    for r in weak:
        kind = "NAMED" if (r.get("qlooType") in NAMED_TYPES and r.get("kind") == "entity") else ("MUSIC STYLE" if r.get("qlooType") == "music_genre" else "CONCEPT")
        listing = "\n".join(f"  - id={c['id']} | {c['name']} ({c['type'].split(':')[-1]}) {c['about']}" for c in cands[r["id"]])
        blocks.append(f"[{r['id']}] {kind} reference: \"{r['text']}\" (role: {r['role']}, Qloo fit in {target}: {r['scores'].get(target)})\n  line: \"{_line_of(creative['text'], r['text'])}\"\n  candidates:\n{listing}")
    request = f"USER REQUEST: {instructions}\n" if instructions else ""
    lock_txt = f"LOCKED (never change): {', '.join(locked)}\n" if locked else ""
    prompt = f"{request}{lock_txt}Source region: {source or 'unknown'} → target region: {target}\nAudience: {audience or 'adults'}\n\n" + "\n\n".join(blocks)
    out = await gemini.json_call(Picks, SYSTEM, [prompt], temperature=0.5)
    log.info("adapt %s: %d weak refs, %d picks, anchors=%s", target, len(weak), len(out.picks), [len(p.anchor_ids) for p in out.picks])

    picks = []
    for p in out.picks:
        ref = next((r for r in weak if r["id"] == p.ref_id), None)
        anchors = [by_id[a] for a in p.anchor_ids if a in by_id][:2]
        if ref and anchors and p.replacement.strip():
            picks.append((p, ref, anchors))

    scope, mult = regions.heat_scope(region_list)

    async def vibe(ref: dict, anchors: list[dict]) -> dict | None:
        # Qloo's own style/theme tags for what changes: what set the original apart, and what sets the replacement apart.
        a = [s["id"] for s in ref.get("signals") or [] if s.get("kind") == "entity"][:2]
        b = [x["id"] for x in anchors if x["kind"] == "entity"][:2]
        if not a or not b:
            return None
        from . import intel
        cmp = await qloo.compare(a, b)
        v = {"from": intel._vibe_tags(cmp.get("a", [])), "to": intel._vibe_tags(cmp.get("b", []))}
        return v if v["from"] or v["to"] else None

    anchor_cells, vibes = await asyncio.gather(
        asyncio.gather(*[asyncio.gather(*[qloo.heatmap(qloo.heat_params(a), scope) for a in anchors]) for _, _, anchors in picks]),
        asyncio.gather(*[vibe(ref, anchors) for _, ref, anchors in picks]),
    )

    swaps, evidence, items = [], [], []
    for (p, ref, anchors), cells, vb in zip(picks, anchor_cells, vibes):
        rows = []
        for a, cs in zip(anchors, cells):
            by = {rg["name"]: v for rg in region_list if (v := regions.score_in(cs, rg, mult)) is not None}
            if by:
                rows.append((a, by))
        if not rows:
            continue
        to_scores = {rg["name"]: round(sum(b[rg["name"]] for _, b in rows if rg["name"] in b) / max(1, sum(1 for _, b in rows if rg["name"] in b))) for rg in region_list if any(rg["name"] in b for _, b in rows)}
        to_score = to_scores.get(target)
        if to_score is None or to_score <= ref["scores"].get(target, 0):
            continue
        ev = {
            "id": f"ev_{uuid.uuid4().hex[:10]}",
            "title": f"{ref['label']} → {p.replacement}",
            "claim": p.why,
            "entities": [{"name": a["name"], "type": a["type"], "id": a["id"], "byCity": by} for a, by in rows if a["kind"] == "entity"],
            "tags": [{"name": a["name"], "id": a["id"]} for a, _ in rows if a["kind"] == "tag"],
            "tagScores": [{"name": a["name"], "id": a["id"], "byCity": by} for a, by in rows if a["kind"] == "tag"],
            "from": {"name": ref["label"], "byCity": ref["scores"]},
            **({"vibe": vb} if vb else {}),
            "calls": [qloo.call_string("/v2/insights", {"filter.type": a["type"] if a["kind"] == "entity" else "urn:tag", "signal.location.query": target, **({"signal.demographics.age": age} if age else {})}) for a, _ in rows]
            + [qloo.call_string("/v2/insights", {"filter.type": "urn:heatmap", **scope, **qloo.heat_params(a)}) for a, _ in rows],
        }
        evidence.append(ev)
        sid = f"sw_{uuid.uuid4().hex[:10]}"
        swaps.append({
            "id": sid,
            "refId": ref["id"],
            "from": ref["text"],
            "to": p.replacement.strip(),
            "why": p.why,
            "toScore": to_score,
            "toScores": to_scores,
            "toSignals": [{"kind": a["kind"], "id": a["id"], "name": a["name"], "type": a["type"]} for a, _ in rows],
            "evidenceId": ev["id"],
            "status": "pending",
            "at": ref.get("at"),
            **({"vibe": vb} if vb else {}),
        })
        new_line = _line_of(creative["text"], ref["text"]).replace(ref["text"], p.replacement.strip())
        items.append({"id": sid, "text": f"New line for {target}: \"{new_line}\"", "region": target})

    flags = await sensitivity.check(items, brief)
    for s in swaps:
        if s["id"] in flags:
            s["flag"] = {"reason": flags[s["id"]]["reason"], "safer": flags[s["id"]]["safer"]}
    reply = out.reply.strip()
    if focus and not swaps:
        reply = (reply + " " if reply else "") + f"Qloo found no local alternative that scores higher than the current one in {target}, so it may be fine as it is."
    for r in new_refs:  # point the new reference at the evidence of its swap, if any
        r["evidenceId"] = next((s["evidenceId"] for s in swaps if s["refId"] == r["id"]), "")
    return {"swaps": swaps, "evidence": evidence, "reply": reply, "newRefs": new_refs}
