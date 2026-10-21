# Action AI

Four agents that know what every region's audience loves: **Create**, **Test**, **Adapt** and **Spend** for ad teams. Qloo's taste graph supplies every number; Gemini reads ads and writes.

## Run it locally

You need Python 3.11+ and Node 20+.

**1. Backend** (FastAPI, port 8000)

```bash
cd server
python -m venv .venv
.venv/Scripts/activate        # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # then fill in the keys
uvicorn app.main:app --port 8000
```

**2. Supabase tables** (once): open Supabase → SQL Editor, paste [server/supabase/schema.sql](server/supabase/schema.sql), run it. Without the tables the backend still works, caching to `server/.cache/` locally.

**3. Frontend** (Vite, port 5173)

```bash
cd web
npm install
npm run dev
```

The frontend talks to `http://localhost:8000` by default; set `VITE_API_URL` to point elsewhere.

## Keys (server/.env only, never in the browser)

| Variable | What it's for |
| --- | --- |
| `QLOO_API_KEY` | Qloo hackathon API (`X-Api-Key`) |
| `GEMINI_API_KEY` | Google AI Studio. Free tier is 5 requests/min per model; enable billing for real traffic |
| `GROQ_API_KEY` | Open-weight models (gpt-oss-120b) for the short text tasks: routing, sensitivity check, personas, follow-ups. Optional; falls back to Gemini |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Campaign storage, Qloo response cache, uploaded creatives |

## How Qloo is used

| Step | Qloo call |
| --- | --- |
| Score a reference per region | `/v2/insights?filter.type=urn:heatmap&filter.location.query=India` for the entity or music-genre tag, averaged over each region's area |
| Concepts (a wedding, a street-food run) | Scored through 2–3 Qloo entities that embody them (named in the evidence panel) |
| Regional taste profiles | `/v2/insights` per entity type with `signal.location.query` and `signal.demographics.age` |
| Local equivalents (Adapt) | The target region's top entities and genres; the swap is scored on the chosen anchors' heatmaps |
| Personas | `/v2/insights` per age and gender band in the region |
| Towns and states | `/search` destinations for coordinates; small towns use a point + radius signal |

Every score, insight and swap links to the Qloo entities, tag IDs and calls behind it.

## Layout

- `server/app/agents/`: read (creative reader), profile (Create), adapt, talk (personas, follow-ups, router understanding), sensitivity
- `server/app/qloo.py`, `regions.py`, `cache.py`: Qloo client, region scoring, private cache
- `web/src/lib/engine/`: router, step runners, scoring and the budget split
- `web/src/components/`: home, workspace, the four agent views

Product brief: [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) · Qloo notes: [docs/QLOO_API.md](docs/QLOO_API.md)

## License

MIT
