import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip().strip('"').strip("'")


QLOO_API_KEY = _env("QLOO_API_KEY")
QLOO_BASE_URL = _env("QLOO_BASE_URL", "https://hackathon.api.qloo.com").rstrip("/")

GEMINI_API_KEY = _env("GEMINI_API_KEY")
GEMINI_MODEL = _env("GEMINI_MODEL", "gemini-2.5-flash")
# Tried in order when the main model is rate-limited or overloaded (each model has its own quota).
GEMINI_FALLBACKS = [m for m in _env("GEMINI_FALLBACKS", "gemini-3.1-flash-lite,gemini-3.5-flash-lite,gemini-flash-lite-latest").split(",") if m]

GROQ_API_KEY = _env("GROQ_API_KEY")
GROQ_MODELS = [m for m in _env("GROQ_MODELS", "openai/gpt-oss-120b,openai/gpt-oss-20b").split(",") if m]

POLLINATIONS_API_KEY = _env("POLLINATIONS_API_KEY")
POLLINATIONS_MODEL = _env("POLLINATIONS_MODEL", "black-forest-labs/flux.1-schnell")

# Accept the bare project URL or one copied with /rest/v1/ on the end.
SUPABASE_URL = _env("SUPABASE_URL").split("/rest/v1")[0].rstrip("/")
SUPABASE_ANON_KEY = _env("SUPABASE_ANON_KEY")
SUPABASE_SERVICE_ROLE_KEY = _env("SUPABASE_SERVICE_ROLE_KEY")
SUPABASE_BUCKET = _env("SUPABASE_BUCKET", "creatives")

ALLOWED_ORIGINS = [o for o in _env("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:5179").split(",") if o]

CACHE_DIR = Path(__file__).resolve().parent.parent / ".cache"
