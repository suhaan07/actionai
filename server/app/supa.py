"""Thin Supabase REST + Storage client (service role, server side only)."""
import asyncio
import logging

import httpx

from . import config

log = logging.getLogger("supa")

_H = {
    "apikey": config.SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {config.SUPABASE_SERVICE_ROLE_KEY}",
}

enabled = bool(config.SUPABASE_URL and config.SUPABASE_SERVICE_ROLE_KEY)
_tables_ok: dict[str, bool] = {}
_client = httpx.AsyncClient(timeout=30)
_lock = asyncio.Lock()


async def table_ok(table: str) -> bool:
    """True once we know the table exists. Missing tables fall back to local storage."""
    if not enabled:
        return False
    if table in _tables_ok:
        return _tables_ok[table]
    async with _lock:
        if table not in _tables_ok:
            try:
                r = await _client.get(f"{config.SUPABASE_URL}/rest/v1/{table}", headers=_H, params={"select": "*", "limit": 1})
                _tables_ok[table] = r.status_code == 200
                if r.status_code != 200:
                    log.warning("supabase table %s unavailable (%s); using local fallback", table, r.status_code)
            except httpx.HTTPError:
                _tables_ok[table] = False
    return _tables_ok[table]


def reset_tables() -> None:
    """Re-check tables (after the schema is created)."""
    _tables_ok.clear()


async def select_one(table: str, key: str, value: str):
    if not await table_ok(table):
        return None
    r = await _client.get(f"{config.SUPABASE_URL}/rest/v1/{table}", headers=_H, params={key: f"eq.{value}", "select": "*", "limit": 1})
    if r.status_code != 200:
        return None
    rows = r.json()
    return rows[0] if rows else None


async def upsert(table: str, row: dict) -> bool:
    if not await table_ok(table):
        return False
    r = await _client.post(
        f"{config.SUPABASE_URL}/rest/v1/{table}",
        headers={**_H, "Prefer": "resolution=merge-duplicates,return=minimal", "Content-Type": "application/json"},
        json=row,
    )
    if r.status_code >= 300:
        log.warning("supabase upsert %s failed: %s %s", table, r.status_code, r.text[:200])
    return r.status_code < 300


_bucket_ready = False


async def ensure_bucket() -> bool:
    global _bucket_ready
    if not enabled:
        return False
    if _bucket_ready:
        return True
    r = await _client.get(f"{config.SUPABASE_URL}/storage/v1/bucket/{config.SUPABASE_BUCKET}", headers=_H)
    if r.status_code != 200:
        r = await _client.post(
            f"{config.SUPABASE_URL}/storage/v1/bucket",
            headers=_H,
            json={"id": config.SUPABASE_BUCKET, "name": config.SUPABASE_BUCKET, "public": False, "file_size_limit": 52428800},
        )
        if r.status_code >= 300 and "already exists" not in r.text:
            log.warning("bucket create failed: %s %s", r.status_code, r.text[:200])
            return False
    _bucket_ready = True
    return True


async def upload(path: str, data: bytes, mime: str) -> str | None:
    if not await ensure_bucket():
        return None
    r = await _client.post(
        f"{config.SUPABASE_URL}/storage/v1/object/{config.SUPABASE_BUCKET}/{path}",
        headers={**_H, "Content-Type": mime, "x-upsert": "true"},
        content=data,
    )
    if r.status_code >= 300:
        log.warning("upload failed: %s %s", r.status_code, r.text[:200])
        return None
    return path
