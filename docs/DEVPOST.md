# Action AI — Devpost submission text

**Tagline (short description):** Creative intelligence that makes every ad land in every city, powered by Qloo's taste graph.

---

## Inspiration

A brand makes one hero ad and stretches it across a country. In India, a campaign built on Punjabi weddings, Bollywood and Delhi street food lands flat in Chennai. In the US, a Nashville country spot means little in Miami. Regional versions are usually just translated, the strategic insight comes from gut feel, and media budgets are split by population. Testing ads for regional fit means survey panels: slow, expensive, and only ever run on the final cut.

We wanted a tool that answers, before any money is spent: *will this version work in that city, what should change, and where should the budget go?* Qloo's taste graph is the first data source that can answer that across music, film, TV, brands, people and places, city by city.

## What it does

Action AI is a team of agents behind one prompt box. A router reads the request, in any wording, and runs the right agents in order, shown as a live shot list.

- **Create:** from a brief to each city's Qloo taste profile, three insights and three routes per city, a master script, an Instagram post design, Reel ideas, tie-ins and a production brief. If the brief contains an assumption ("make it for Chennai with Hindi songs, they'll love it"), Qloo checks it first. Hindi music scores 47 in Chennai, the lowest of six cities, so Action AI says so and builds on what Chennai does over-index on.
- **Test:** upload a script, image, video or Reel. Gemini finds every cultural reference; Qloo scores each one per city. Click a city and the script recolours. Simulated personas, each built from a real Qloo taste cluster, react to it.
- **Adapt:** every weak reference is swapped for what holds the same cultural slot in the target city. Each swap must score higher in Qloo than the original, explains why, passes a sensitivity check, and can be accepted or rejected line by line. Sponsors and anything you say to keep stay locked. AI mock-ups show the before and after.
- **Spend:** a starting budget split by cultural fit × audience size ÷ CPM, "fix before you spend" flags for big cities where the ad fits badly, a targeting pack, creator suggestions and a Meta Ads Manager CSV.
- **Ask:** any question Qloo can answer. "Maybe Virat Kohli as our cricket ambassador in London and Mumbai?" returns 72 in London, 100 in Mumbai, plus Qloo's own cricketers for each city (Ben Stokes for London, Hardik Pandya for Mumbai).

Every score, insight and swap has a footnote that opens the Qloo entities, per-city affinity and the exact API calls behind it. A shareable report turns the campaign into one page for a boss or client.

It works for India, the US and the UK out of the box, and for any city, town or state Qloo knows.

## How we built it

**Qloo does the measuring; the language models only read and write.**

- **Reading an ad:** Gemini 2.5 Flash extracts cultural cues from text, images, video and audio, with timestamps for video. Each cue resolves through Qloo `/search` (typed entities) or `/v2/tags` (genre tags, ranked so "Punjabi" beats "pop"). Concepts with no entity, such as a wedding sangeet, are scored through 2–3 Qloo entities that embody them.
- **Scoring:** Qloo heatmaps (`filter.type=urn:heatmap`) for each signal, averaged over each city's radius. Cities in one country use that country's heatmap; cities across countries use a world polygon, so London and Mumbai compare fairly.
- **Profiles:** `/v2/insights` per entity type with `signal.location.query`, plus music and media genre tags per city, with items shared by every city removed so each profile shows what is distinctive.
- **Towns and states:** destinations resolved through `/search`, then queried as `signal.location` POINT + radius.
- **People:** Qloo's occupation tags (Cricketer, Influencer…) find the most popular people in a field; `/v2/insights` ranks people around them per city; results are kept only if Qloo tags them with that occupation. Named candidates are scored by their own heatmap.
- **Personas:** `signal.demographics.age` and `gender` per city give each simulated persona a real taste cluster.
- **Router:** one structured-output call turns a message into intents, regions, market, budget, deliverables, things to keep, things to change, assumptions to check and clarifying questions, with memory of the last few messages.
- **Models:** Gemini for reading media and writing; Groq (gpt-oss-120b) for routing, sensitivity checks, personas and follow-ups; each falls back to the other. Pollinations FLUX renders mock-ups with no text in them; the app overlays headlines so they are always spelled right.
- **Stack:** React, Vite, TypeScript and Tailwind on Vercel; FastAPI on Render; Supabase for a private Qloo cache, campaigns and uploads.
- **Guardrails:** a sensitivity check on every route, swap and script, using a curated global, country and city list. It fails closed, and a flagged swap cannot be accepted without a safer option or a logged human override.

## Challenges we ran into

- **Concepts aren't entities.** Most of what makes an ad regional (a wedding, a street-food run, a festival morning) has no Qloo entity. Scoring them through entities that embody them, and naming those in the evidence, made them measurable and auditable.
- **City lists flatten.** Filtering by age pulled every city toward the same global hits, and city lists overlap. City-level taste plus removing what every city shares brought out what's local.
- **People lookups drifted off-topic.** "Public figures Mumbai likes" returns actors for a cricket bat. Using Qloo's own occupation tags fixed it, after we found Qloo uses two IDs for the same occupation and switched to matching by name.
- **Free-tier limits.** Gemini's free quota is small, so routing and checks moved to Groq, every Qloo and model response is cached, and the guided tour replays from cache instantly.
- **Understanding real messages.** Early on, the router dropped instructions like "keep the sponsor" or took a city as the thing to change. Explicit fields for constraints, focus and assumptions, taken only from the current message, fixed it.

## Accomplishments that we're proud of

- A full product, not a demo script: four agents plus Ask that chain themselves, a guided tour in two markets, evidence on every number, a shareable report and a Meta export.
- It disagrees with you when the data does: wrong assumptions get a number, not a polite yes.
- Every swap must beat the original in Qloo's data before it is proposed.
- It works beyond the metros, across countries, and for cause campaigns as well as products.

## What we learned

Taste data is most valuable as evidence for a decision, not as a recommendation to a consumer. Qloo never recommends anything to an end user here; it tells an ad team whether a creative fits a city and what to change.

## What's next

- Connect Meta Ads Manager to push splits and targeting live, and read results back to compare predicted fit with real click-through by city.
- Generate the adapted video, not just a frame, from the adapted script.
- More markets beyond India, the US and the UK.
- Pilot with a D2C brand and an agency on a live multi-city launch.

## Built with

Qloo API · Gemini 2.5 Flash · Groq (gpt-oss-120b) · Pollinations (FLUX) · FastAPI · Python · React · TypeScript · Vite · Tailwind CSS · Supabase · Vercel · Render

---

## Testing instructions (for judges)

1. Open the live demo at https://actionai-pink.vercel.app. No login is needed.
2. Click **Take the tour** for the US version, or **or the India version**. It is a fictional music festival (EchoFest) touring five cities; you click each step yourself. About 4 minutes.
3. Then try your own request on the home page, for example:
   - `Launching a canned cold coffee for college students in Mumbai, Bengaluru and Kolkata: insights, a script and 3 Reel ideas`
   - `Make our coffee ad for Chennai with Hindi songs, they'll love it`
   - `Who could be our cricket ambassador in London and Mumbai?`
   - Upload any ad image or short video and ask `Will this work in New York, Atlanta and Miami?`
4. Click any small number next to a claim to see the Qloo data behind it. **Share report** opens a one-page summary.

The first request after a quiet period can take up to a minute while the free server wakes up. New requests make live Qloo and model calls (20–60 seconds); the tour and repeated requests are instant.
