"""Copy the local cache (server/.cache/*.json) into Supabase `qloo_cache`, so production starts warm.

Run once after creating the tables (supabase/schema.sql):
    .venv/Scripts/python scripts/push_cache.py
The cache holds Qloo-derived data: it goes to the private Supabase table, never into git.
"""
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import config, supa  # noqa: E402


async def main():
    if not await supa.table_ok("qloo_cache"):
        print("Supabase table qloo_cache not found. Run supabase/schema.sql in the SQL editor first.")
        return
    files = [f for f in config.CACHE_DIR.glob("*.json")]
    ok = 0
    for i, f in enumerate(files, 1):
        if await supa.upsert("qloo_cache", {"key": f.stem, "value": json.loads(f.read_text(encoding="utf8"))}):
            ok += 1
        if i % 50 == 0:
            print(f"{i}/{len(files)}")
    print(f"Pushed {ok}/{len(files)} cached responses to Supabase.")


asyncio.run(main())
