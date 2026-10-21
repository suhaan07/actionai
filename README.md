# Action AI

**Creative intelligence that makes every ad land in every city.**

Action AI is a team of agents for ad teams. It reads an ad, scores every cultural reference in it for each city with Qloo's taste graph, rewrites what doesn't fit, and splits the media budget by measured cultural fit, before a rupee or dollar is spent.

**Live demo:** https://actionai-pink.vercel.app · open it and click **Take the tour** (US or India, about 4 minutes, you click through).
**Backend:** https://actionai-api.onrender.com/health

---

## The problem

Brands make one hero ad and stretch it across a country. In India a campaign built on Punjabi weddings, Bollywood and Delhi street food lands flat in Chennai or Kolkata; in the US a Nashville country spot means little in Miami. Regional versions are usually just translated, the "insight" step runs on gut feel, and budgets are split by population. Testing ads for regional fit (with survey panels from firms like Kantar or System1) is slow and expensive, so it happens on the final cut only, if at all.

**Who it's for:** brand managers and agencies running multi-city campaigns, starting with D2C and FMCG brands; also film, OTT, live-event and sports marketing teams.

## What it does

One prompt box, four agents, plus Ask. A router reads each request (in any wording, Hinglish included) and plans the run as a visible shot list.

| Agent | You bring | You get |
| --- | --- | --- |
| **✦ Create** | A brief | Each city's taste profile, 3 insights and 3 routes per city, a master script, an Instagram post design, Reel ideas, tie-ins and a production brief |
| **◎ Test** | A script, image, video or Reel | Every cultural reference found and scored per city, what helps and hurts, simulated personas built from Qloo taste clusters |
| **⇄ Adapt** | An ad that works in one city | Each weak reference swapped for what holds the same cultural slot in the target city, scored, explained, sensitivity-checked, with AI before/after mock-ups |
| **▤ Spend** | A budget | A starting split by cultural fit × audience ÷ CPM, "fix before you spend" flags, a targeting pack, creator suggestions, and a Meta Ads Manager CSV |
| **? Ask** | Any question | Answers from Qloo data: headliners, ambassadors, creators, tie-ins, with a verdict on any name you suggest |

Every score, insight and swap carries a footnote that opens the Qloo entities, per-city affinity and the exact API calls behind it. A shareable report and PDF summarise the campaign.

### Examples from the live data

- **"Make our coffee ad for Chennai with Hindi songs, they'll love it."** Create checks the assumption first. Qloo: Hindi music scores **47 in Chennai**, the lowest of six Indian cities (Kolkata 92, Delhi 87). It says so, and builds the script on what Chennai does over-index on.
- **Punjabi music:** Delhi **99** vs Chennai **22**. **Country music:** Nashville **87** vs Miami **25**.
- **Adapt, Nashville → Miami:** the honky-tonk, steel-guitar anthem and hot chicken become a South Beach nightclub, a cubaton track and Miami's own food spots; fit climbs into the 90s, sponsor untouched.
- **"Maybe Virat Kohli as our cricket ambassador?"** Kohli scores 72 in London and 100 in Mumbai; Qloo's own cricketers ranked for each city add Ben Stokes (London 92) and Hardik Pandya (Mumbai 100).

## How Qloo is used

Qloo is the source of every number. The language models read and write; they never invent a score.

| Step | Qloo call | Detail |
| --- | --- | --- |
| Resolve a reference | `GET /search` (typed: artist, movie, tv_show, brand, person, place, destination) and `GET /v2/tags` (`filter.query`, `filter.tag.types`) | Named things resolve to entities; music styles to the most specific genre tag (regional words like "Punjabi" or "Tamil" outrank generic ones like "pop") |
| Score a reference in each city | `GET /v2/insights?filter.type=urn:heatmap` with `signal.interests.entities` or `signal.interests.tags` | Heatmap cells are averaged over each city's radius. One country → that country's heatmap (`filter.location.query=India`); several countries → a world polygon (`filter.location`) so cities stay comparable |
| Concepts with no Qloo entity | Same heatmap, on 2–3 proxy entities that embody the concept | e.g. a "Punjabi wedding sangeet" is scored through films and genres tied to it; the evidence panel names the proxies |
| City taste profiles | `/v2/insights` per type (`artist`, `movie`, `tv_show`, `brand`, `person`, `place`) with `signal.location.query`, plus `filter.type=urn:tag` with `filter.tag.types=urn:tag:genre:music` / `…:media` | Items shared by every city are dropped so each profile shows what is distinctive |
| Small towns and states | `/search` destinations for coordinates, then `signal.location=POINT(lon lat)` + `signal.location.radius` | Works beyond preset metros, e.g. Varanasi, Uttar Pradesh |
| Local equivalents (Adapt) | The target city's top entities and genres → Gemini picks anchors → each anchor's heatmap | A swap is only proposed if its anchors score higher in the target city than the original reference |
| Personas | `/v2/insights` with `signal.demographics.age` and `signal.demographics.gender` per city | Each persona is a real taste cluster; labelled as simulated |
| People on a topic | `/v2/tags` finds the occupation tag (e.g. Cricketer, Influencer) → `/search` finds Qloo's most popular people with it → `/v2/insights` ranks people around them per city → results kept only if Qloo tags them with that occupation | Qloo uses more than one ID for the same occupation, so matching is by tag name |
| Assumption checks | Heatmap of the thing the user assumed, across the market's cities | Answers "will Hindi songs work in Chennai?" with a number |

**Caching.** Every Qloo response is cached privately (Supabase, disk fallback), as Qloo's hackathon terms allow. No Qloo data is committed to this repository.

## Architecture

```
React + Vite + TypeScript + Tailwind (Vercel)
        │  REST
FastAPI (Render) ── Qloo API ............ every score, profile, person and heatmap
        ├── Gemini 2.5 Flash ............ reads scripts, images, video and audio; writes Create and Adapt output
        ├── Groq · gpt-oss-120b ......... routing, sensitivity check, personas, follow-up answers (fast, cheap)
        ├── Pollinations · FLUX ......... visual mock-ups (images carry no text; the app overlays it)
        └── Supabase .................... private Qloo cache, saved campaigns, uploaded creatives
```

- **Router with memory.** One structured-output call turns a message into intents, regions, market, budget, deliverables, constraints ("keep the sponsor"), focus ("only the music"), assumptions to check and clarifying questions written for that request. It sees the last few messages, so "make it work in Delhi too" connects.
- **Agents chain themselves.** Spend needs scores, so Test runs first; Create's master script is read and scored before Adapt; "adapt the weak cities" expands into one step per city under 50.
- **Model fallback both ways.** Gemini falls back across Gemini models and then Groq for text; Groq falls back to Gemini. Identical requests are answered from cache.
- **Guardrails.** The sensitivity check runs on every route, swap and master script, with a curated global, country and city list ([server/data/sensitivity.json](server/data/sensitivity.json)). It fails closed: if it can't run, every item needs a human look. Flagged swaps can't be accepted without a safer option or a logged override.

## Honest limits

- Fit scores are predictions for pre-testing, not A/B results. Budget splits are a starting point, not a forecast.
- Qloo ranks creators by how much a city's audience likes them, not by category fit; check fit with your brand yourself.
- Small-town and rural data is thinner than for metros.
- The Meta export is a starting file for Ads Manager's bulk import; check interests exist in Meta before importing.
- Only aggregate regional taste is used. No individual is profiled, and no face is identified in uploaded media.

## Run it locally

Python 3.11+ and Node 20+.

```bash
# backend (port 8000)
cd server
python -m venv .venv
.venv/Scripts/activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env              # fill in the keys below
uvicorn app.main:app --port 8000

# frontend (port 5173)
cd web
npm install
npm run dev
```

Create the tables once: paste [server/supabase/schema.sql](server/supabase/schema.sql) into Supabase → SQL Editor and run it. Without Supabase the backend still runs, caching to `server/.cache/`.

| Variable (server/.env) | For |
| --- | --- |
| `QLOO_API_KEY`, `QLOO_BASE_URL` | Qloo hackathon API |
| `GEMINI_API_KEY` | Google AI Studio |
| `GROQ_API_KEY` | Groq (optional; falls back to Gemini) |
| `POLLINATIONS_API_KEY` | Image mock-ups (optional) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Cache and campaigns |

## Deploy

- **Backend:** Render web service, root `server`, build `pip install -r requirements.txt`, start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, `PYTHON_VERSION=3.12.7`, the variables above. See [render.yaml](render.yaml).
- **Frontend:** Vercel, root `web`, `VITE_API_URL` set to the backend URL. [web/vercel.json](web/vercel.json) handles client-side routes.
- **Warm cache:** `python scripts/push_cache.py` copies a local cache into Supabase.
- **Keep-alive:** ping `/health?deep=1` every few minutes (UptimeRobot, or the GitHub Action in `.github/workflows`).

## Repository

| Path | What |
| --- | --- |
| `server/app/agents/read.py` | Creative reader: cue extraction, Qloo resolution, heatmap scoring |
| `server/app/agents/profile.py` | City profiles, Create writing, assumption checks |
| `server/app/agents/adapt.py` | Local equivalents, locks, focus, sensitivity |
| `server/app/agents/ask.py` | Questions answered from Qloo, topic and creator people |
| `server/app/agents/talk.py` | Router understanding, personas, follow-ups |
| `server/app/regions.py` | Markets, cities, states, towns, heatmap scoping |
| `web/src/lib/engine/` | Router plan, step runners, scoring and budget split |
| `web/src/lib/tour.ts` | The guided product tour |
| `docs/` | Build plan and Qloo API notes |

MIT licensed.
