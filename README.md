# Action AI

**Creative intelligence that makes every ad land in every city.**

Action AI is a team of agents for ad teams, and for the creators and small brands who have no ad team. It reads an ad or a Reel, scores every cultural reference in it for each city with Qloo's taste graph, rewrites what doesn't fit, and splits the budget by measured cultural fit, before a rupee or dollar is spent.

**Live demo:** https://actionai-pink.vercel.app · it opens on **For creators**: click **Take the tour** (US or India, about 3 minutes, you click through). Switch to **For ad teams** for the brand tour.
**Backend:** https://actionai-api.onrender.com/health

---

## Why Action AI is different

An **agentic, multi-agent creative-intelligence platform** built on Qloo's taste graph. In one line: **pre-test an ad or a Reel city by city, fix it per city, then let the creative decide the budget.**

- **The creative decides the money.** Most taste tools pick a market or describe an audience. Action AI scores *this specific ad's* cultural references in every city, decides which version of the ad runs where, and splits the budget by fit × audience ÷ CPM (a starting split, not a forecast), exported as a Meta Ads Manager file.
- **A closed loop, not a report.** Test → Adapt → re-test → Spend, chained by a router that plans each request as a visible shot list. Multi-agent orchestration with a human in the loop: every swap is accepted or rejected line by line.
- **Signals connected, and enforced in code.** Cultural fit, fan age and gender skew (`urn:demographics`), Qloo's own vibe tags (`/v2/insights/compare`), cross-domain affinity (brands, podcasts, shows, venues), niche picks (popularity filter), interest audiences, competitor heatmaps and hotspots inside each city go into one evidence-tagged signal sheet. The model gets a playbook of how they relate, and any insight that doesn't combine two signals and cite them is dropped.
- **Evidence on every number.** Every score, insight and swap opens the Qloo entity IDs, per-city affinity and exact API calls behind it. Language models read and write; Qloo measures. No invented scores.
- **Two markets of users, one engine.** Ad teams and agencies (Create, Test, Adapt, Spend) and the creator economy (Grow: where a Reel lands next, a post plan per city, collabs, brand deals and a small boost).
- **Transcreation, not translation.** Each weak reference is swapped for what holds the same cultural slot in the target city, and must score higher there than what it replaces. Sponsors and anything locked never change.
- **Multimodal input.** Scripts, images, video and Reels: Gemini reads visuals, on-screen text, speech and music, with timestamps.
- **Brand safety built in.** A sensitivity check on every route, swap, script and caption. It fails closed and never auto-approves.
- **Privacy-first.** Aggregate regional taste only: no personal data, no face identification, no targeting by ethnicity or orientation.
- **Global and hyper-local.** India, the US and the UK out of the box, plus any city, town or state Qloo knows, compared on one scale across countries.

---

## The problem

Brands make one hero ad and stretch it across a country. In India a campaign built on Punjabi weddings, Bollywood and Delhi street food lands flat in Chennai or Kolkata; in the US a Nashville country spot means little in Miami. Regional versions are usually just translated, the "insight" step runs on gut feel, and budgets are split by population. Testing ads for regional fit (with survey panels from firms like Kantar or System1) is slow and expensive, so it happens on the final cut only, if at all.

**Who it's for:** brand managers and agencies running multi-city campaigns, starting with D2C and FMCG brands; also film, OTT, live-event and sports marketing teams. And creators: a Gen Z food vlogger in Delhi or a thrift-fit TikToker in Atlanta has the same problem with no brand manager, no research budget and no idea which city to court next. A switch on the home page turns Action AI into their growth tool.

## What it does

One prompt box, four agents for ad teams, Grow for creators, plus Ask. A router reads each request (in any wording, Hinglish included) and plans the run as a visible shot list.

| Agent | You bring | You get |
| --- | --- | --- |
| **✦ Create** | A brief | Each city's taste profile, 3 insights and 3 routes per city, a master script, an Instagram post design, Reel ideas, tie-ins and a production brief |
| **◎ Test** | A script, image, video or Reel | Every cultural reference found and scored per city, what helps and hurts, simulated personas built from Qloo taste clusters |
| **⇄ Adapt** | An ad that works in one city | Each weak reference swapped for what holds the same cultural slot in the target city, scored, explained, sensitivity-checked, with AI before/after mock-ups |
| **▤ Spend** | A budget | A starting split by cultural fit × audience ÷ CPM, "fix before you spend" flags, a targeting pack, creator suggestions, and a Meta Ads Manager CSV |
| **↗ Grow** (creators) | A Reel, a post, or just "I make street food Reels in Delhi" | Where the content lands next (Qloo fit × people there), and for each city a hook, caption, hashtags, audio, one local touch with its Qloo evidence, and local creators to duet, stitch or collab with |
| **◈ Deep dive** | An ad that has been tested | A strategist read that connects every Qloo signal about it: who it really reaches (fan age and gender skew), the vibe gap per city, the brands, podcasts and shows its audience loves, niche local artists, venues and hotspots inside each city, competitors and interest audiences. Each insight must combine two or more signals, cite them, and end in an action |
| **? Ask** | Any question | Answers from Qloo data: headliners, ambassadors, creators, tie-ins, with a verdict on any name you suggest |

Every score, insight and swap carries a footnote that opens the Qloo entities, per-city affinity and the exact API calls behind it.

**Also in the app**

- **Four guided tours**, clicked through step by step and replayed from cache, so they are instant. For creators: a thrift-fit TikToker in Atlanta (US) or a street-food Reels creator in Delhi (India) goes from one line to the cities to grow into, a post plan and Reel-cover mock-up per city, collabs and brand deals, a pre-test, a rewrite for the weakest city and a small boost. For ad teams: a fictional music festival, EchoFest, touring five cities in the US or India.
- **Visual mock-ups:** Pollinations FLUX renders a frame for the post and for Adapt's before and after. Images carry no text; the app overlays the headline so it is always spelled right.
- **Shareable report** at `/r/<id>`: one page for a boss or client, printable to PDF.
- **Meta Ads Manager CSV:** the starting split, interests and regions in a bulk-import file.
- **Conversation, not forms:** follow-ups build on the campaign so far ("make it work in Delhi too"); **Stop** cancels a run, **Edit & resend** rewrites a message, and loading skeletons show what is coming.
- **Any market:** India, US and UK presets, plus any city, town or state Qloo knows, across countries.
- **For ad teams / For creators:** one switch on the home page changes the pitch, the examples and the agent cards (Grow, Test, Adapt, Boost).

### Examples from the live data

- **"Make our coffee ad for Chennai with Hindi songs, they'll love it."** Create checks the assumption first. Qloo: Hindi music scores **47 in Chennai**, the lowest of six Indian cities (Kolkata 92, Delhi 87). It says so, and builds the script on what Chennai does over-index on.
- **Punjabi music:** Delhi **99** vs Chennai **22**. **Country music:** Nashville **87** vs Miami **25**.
- **Adapt, Nashville → Miami:** the honky-tonk, steel-guitar anthem and hot chicken become a South Beach nightclub, a cubaton track and Miami's own food spots; fit climbs into the 90s, sponsor untouched.
- **"I make street food Reels in Delhi. Which cities would love my content next?"** Grow reads the niche (Old Delhi chaat, paratha stalls, bhangra), scores it across 12 Indian cities (Delhi 89 at home; Jaipur 86, Mumbai 84, Kolkata 84 next; Kochi 39) and writes a post plan per city: "Kolkata, who's up for a chaat showdown?", #KolkataStreetFood, an Anupam Roy sound, a Mani Square collab, and the creators Kolkata's audience over-indexes on.
- **"Maybe Virat Kohli as our cricket ambassador?"** Kohli scores 72 in London and 100 in Mumbai; Qloo's own cricketers ranked for each city add Ben Stokes (London 92) and Hardik Pandya (Mumbai 100).

## Connecting the signals

Most tools show one Qloo number at a time. Action AI's deep dive puts every signal about an ad into one **signal sheet**, each line tagged with
the evidence id behind it, and gives the model a **playbook** of how the signals relate:

| When you see | It means |
| --- | --- |
| High fit, but fans skew away from the target audience | A hidden risk: it lands, with the wrong people. Swap that reference |
| Big city, weak fit | Fix the ad before spending there |
| Low fit and a vibe gap (Qloo style/theme tags) | Move the ad toward the city's tags |
| Partners loved in a low-fit city | A local partner can bridge the gap |
| A rival strong vs its own average where your fit is weak | Defend with a better-fitting version |
| Hottest heatmap cells near venues the audience loves | Where to shoot, pop up or buy outdoor |
| An interest audience concentrated where the ad fits | The primary market |
| A mainstream pick skewing away from the target | Use a niche local pick instead |

Code then checks the output: an insight that cites fewer than two kinds of signal, or evidence that doesn't exist, is dropped. The same
signals feed the other agents: Test shows who the ad speaks to, Ask weighs a named ambassador's fan skew against the target, Grow leans
hooks toward a creator's real audience, Adapt shows the vibe shift of each swap, and Create profiles an interest audience (Health And
Beauty fans in Pune) instead of the whole city.

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
| Who an ad speaks to | `filter.type=urn:demographics` with `signal.interests.entities` | Age-band and gender skew of each reference's fans, blended by prominence and matched against the target audience |
| What the audience also loves | `/v2/insights` for `brand`, `podcast`, `tv_show`, `place` with `signal.interests.entities` (the ad's main references) + the city | Partners, podcasts to sponsor, shows to buy around, venues with coordinates; what every city shares is dropped |
| Niche picks | `filter.popularity.max` | Local artists and reachable creators, not just the mainstream |
| Vibe gap | `GET /v2/insights/compare` | Qloo's own style, theme and audience tags that set the ad apart from each city's favourites, and each swap's before/after |
| Interest audiences | `GET /v2/audiences` and `signal.demographics.audiences` | e.g. Health And Beauty fans per city, and their heatmap; community audiences are deliberately not used for targeting |
| Competitors and hotspots | Heatmaps of each competitor brand; the hero reference's heatmap cells inside each city | Competitor strength relative to its own average; where in a city the ad lands strongest |
| Grow (creators) | The creator's content scored by heatmap across the whole market; each target city's `/v2/insights` lists; its top 100 `urn:entity:person` filtered by Qloo social-creator occupation tags, each scored by heatmap | Every name in a hook, hashtag, sound or local touch must come from that city's lists; celebrity and brand hashtags are filtered out in code |

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
- **Model fallback.** Text work gets one quick Gemini attempt and switches to Groq on any error, then the other Gemini models only if Groq fails too. A model whose daily quota is spent is skipped for an hour. Groq-first work (routing, checks) falls back to Gemini. Images, video and audio are read by Gemini only. Identical requests are answered from cache, so retries cost no quota.
- **Guardrails.** The sensitivity check runs on every route, swap and master script, with a curated global, country and city list ([server/data/sensitivity.json](server/data/sensitivity.json)). It fails closed: if it can't run, every item needs a human look. Flagged swaps can't be accepted without a safer option or a logged override.

## Honest limits

- Fit scores are predictions for pre-testing, not A/B results. Budget splits are a starting point, not a forecast.
- Qloo ranks creators by how much a city's audience likes them, not by category fit; check fit with your brand yourself.
- Small-town and rural data is thinner than for metros.
- The Meta export is a starting file for Ads Manager's bulk import; check interests exist in Meta before importing.
- Grow ranks cities by taste fit and rough audience size, not by follower forecasts. Qloo has no data on posting times, trends or the algorithm, so none of that is guessed.
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
| `GEMINI_MODEL`, `GEMINI_FALLBACKS`, `GROQ_MODELS` | Optional model overrides (defaults: `gemini-2.5-flash`; three Flash-Lite fallbacks; `gpt-oss-120b`, `gpt-oss-20b`) |
| `POLLINATIONS_API_KEY` | Image mock-ups (optional) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Cache and campaigns |

## Deploy

- **Backend:** Render web service, root `server`, build `pip install -r requirements.txt`, start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, `PYTHON_VERSION=3.12.7`, the variables above. See [render.yaml](render.yaml).
- **Frontend:** Vercel, root `web`, `VITE_API_URL` set to the backend URL. [web/vercel.json](web/vercel.json) handles client-side routes.
- **Warm cache:** `python scripts/push_cache.py` (run from `server/`) copies a local cache into Supabase.
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
| `server/app/agents/intel.py` | Deep dive: all signals, the signal sheet, the correlation playbook and its checks |
| `server/app/agents/grow.py` | Grow: per-city post plans and local creators for creators |
| `server/app/agents/sensitivity.py` | Sensitivity check on routes, swaps, scripts and captions |
| `server/app/gemini.py`, `groq.py` | Model calls, fallback and response cache |
| `server/app/imagegen.py` | Mock-up scene prompts and Pollinations rendering |
| `web/src/lib/tour.ts` | The guided product tour |
| `web/src/lib/metaExport.ts`, `web/src/pages/Report.tsx` | Meta CSV export and the shareable report |
| `docs/` | Build plan and Qloo API notes |

MIT licensed.
