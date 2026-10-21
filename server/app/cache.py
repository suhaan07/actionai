"""Private server-side cache for Qloo responses (allowed by Qloo's hackathon terms).

Order: memory → Supabase table `qloo_cache` → local disk (.cache/, gitignored).
Never commit cached Qloo data.
"""
import hashlib
import json
import time

from . import config, supa

_mem: dict[str, object] = {}
config.CACHE_DIR.mkdir(exist_ok=True)


def key_for(*parts) -> str:
    return hashlib.sha256(json.dumps(parts, sort_keys=True, default=str).encode()).hexdigest()[:40]


async def get(key: str):
    if key in _mem:
        return _mem[key]
    row = await supa.select_one("qloo_cache", "key", key)
    if row:
        _mem[key] = row["value"]
        return row["value"]
    f = config.CACHE_DIR / f"{key}.json"
    if f.exists():
        v = json.loads(f.read_text(encoding="utf8"))
        _mem[key] = v
        return v
    return None


async def put(key: str, value) -> None:
    _mem[key] = value
    if not await supa.upsert("qloo_cache", {"key": key, "value": value, "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}):
        (config.CACHE_DIR / f"{key}.json").write_text(json.dumps(value), encoding="utf8")
