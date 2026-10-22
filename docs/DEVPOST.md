# Action AI — Devpost submission text

**Tagline (short description):** Agentic creative intelligence on Qloo's taste graph: pre-test every ad and Reel city by city, fix what won't land, and let the creative decide the budget.

---

## Inspiration

A brand makes one hero ad and stretches it across a country. In India, a campaign built on Punjabi weddings, Bollywood and Delhi street food lands flat in Chennai. In the US, a Nashville country spot means little in Miami. Regional versions are usually just translated, the strategic insight comes from gut feel, and media budgets are split by population. Testing ads for regional fit means survey panels: slow, expensive, and only ever run on the final cut.

Creators have it worse. A Gen Z food vlogger in Delhi or a thrift-fit TikToker in Atlanta wants to reach the next city but has no brand manager, no research budget and no data, only guesses about what Mumbai or Chicago will watch.

We wanted a tool that answers, before any money is spent: *will this version work in that city, what should change, and where should the budget go?* Qloo's taste graph is the first data source that can answer that across music, film, TV, brands, people and places, city by city.

## What it does

Action AI is a team of agents behind one prompt box, for ad teams and for creators. A router reads the request, in any wording, and runs the right agents in order, shown as a live shot list.

- **Create:** from a brief to each city's Qloo taste profile, three insights and three routes per city, a master script, an Instagram post design, Reel ideas, tie-ins and a production brief. If the brief contains an assumption ("make it for Chennai with Hindi songs, they'll love it"), Qloo checks it first. Hindi music scores 47 in Chennai, the lowest of six cities, so Action AI says so and builds on what Chennai does over-index on.
- **Test:** upload a script, image, video or Reel. Gemini finds every cultural reference; Qloo scores each one per city. Click a city and the script recolours. Simulated personas, each built from a real Qloo taste cluster, react to it.
- **Adapt:** every weak reference is swapped for what holds the same cultural slot in the target city. Each swap must score higher in Qloo than the original, explains why, passes a sensitivity check, and can be accepted or rejected line by line. Sponsors and anything you say to keep stay locked. AI mock-ups show the before and after.
- **Spend:** a starting budget split by cultural fit × audience size ÷ CPM, "fix before you spend" flags for big cities where the ad fits badly, a targeting pack, creator suggestions and a Meta Ads Manager CSV.
- **Grow (for creators):** "I make street food Reels in Delhi. Which cities would love my content next?" Grow reads the niche, scores it across the market (Delhi 89 at home; Jaipur 86, Mumbai 84, Kolkata 84 next; Kochi 45) and writes a post plan for each city: a hook aimed at that city ("Kolkata, who's up for a chaat showdown?"), a caption, hashtags people there search, a sound from that city's music list, one local touch with its Qloo evidence, and the creators that city's audience over-indexes on to duet, stitch or collab with. A switch on the home page turns the whole app into a creator tool.
- **Deep dive:** every Qloo signal about an ad, connected. "Your ad fits Mumbai (86) but its fans skew 30–44, so it reaches the wrong people; Haldiram's is strongest there (+13 vs its average); Chennai's partners are X and Y; pop up near Z." It reads who each reference's fans are, the vibe gap per city in Qloo's own style tags, the brands, podcasts and shows the audience loves, niche local artists, hotspots inside each city, competitors and interest audiences, then writes insights that must each combine two or more signals and cite them.
- **Ask:** any question Qloo can answer. "Maybe Virat Kohli as our cricket ambassador in London and Mumbai?" returns 72 in London, 100 in Mumbai, plus Qloo's own cricketers for each city (Ben Stokes for London, Hardik Pandya for Mumbai).

Every score, insight and swap has a footnote that opens the Qloo entities, per-city affinity and the exact API calls behind it. A shareable report turns the campaign into one page for a boss or client.

It works for India, the US and the UK out of the box, and for any city, town or state Qloo knows.

## What makes it different

- **The creative decides the money.** Other taste tools pick a market or describe an audience. Action AI pre-tests *this specific ad* in every city, picks which version runs where, and splits the budget by fit × audience ÷ CPM: a starting split, exported for Meta Ads Manager.
- **A closed agentic loop:** Test → Adapt → re-test → Spend, planned by a router as a visible shot list, with a human approving every swap.
- **Connected signals, enforced in code:** fit, fan skew, vibe tags, cross-domain affinity, niche picks, interest audiences, competitors and city hotspots in one evidence-tagged sheet. An insight that doesn't combine two signals and cite them is dropped.
- **Evidence on every number:** Qloo entity IDs and the exact API calls behind each score, insight and swap. The models read and write; Qloo measures.
- **Ad teams and creators on one engine:** the same pre-testing, adaptation and budget logic serves an agency's ₹10L campaign and a creator's $500 boost.
- **Transcreation, brand safety and privacy:** swaps keep the cultural slot and must score higher; a fail-closed sensitivity check runs on everything; only aggregate regional taste is used.

## How we built it

**Qloo does the measuring; the language models only read and write.**

- **Reading an ad:** Gemini 2.5 Flash extracts cultural cues from text, images, video and audio, with timestamps for video. Each cue resolves through Qloo `/search` (typed entities) or `/v2/tags` (genre tags, ranked so "Punjabi" beats "pop"). Concepts with no entity, such as a wedding sangeet, are scored through 2–3 Qloo entities that embody them.
- **Scoring:** Qloo heatmaps (`filter.type=urn:heatmap`) for each signal, averaged over each city's radius. Cities in one country use that country's heatmap; cities across countries use a world polygon, so London and Mumbai compare fairly.
- **Profiles:** `/v2/insights` per entity type with `signal.location.query`, plus music and media genre tags per city, with items shared by every city removed so each profile shows what is distinctive.
- **Towns and states:** destinations resolved through `/search`, then queried as `signal.location` POINT + radius.
- **Grow:** the creator's content is scored by heatmap across the whole market, ranked by fit² × √audience; target cities get their `/v2/insights` lists, and their top 100 public figures are filtered to Qloo's social-creator occupation tags and scored by heatmap. Hashtags that are just a celebrity's or brand's name are filtered out in code.
- **People:** Qloo's occupation tags (Cricketer, Influencer…) find the most popular people in a field; `/v2/insights` ranks people around them per city; results are kept only if Qloo tags them with that occupation. Named candidates are scored by their own heatmap.
- **Personas:** `signal.demographics.age` and `gender` per city give each simulated persona a real taste cluster.
- **Correlation, not a list of numbers:** the deep dive builds one signal sheet (fit, fan skew, vibe tags, cross-domain loves, niche picks, rival strength, interest audiences, hotspots, audience size), each line tagged with its evidence id, and a playbook of how the signals relate (high fit + wrong skew = hidden risk; big city + weak fit = fix before spending; rival strong where you're weak = defend; hotspots near loved venues = where to pop up). Code drops any insight that cites fewer than two kinds of signal or evidence that doesn't exist. Qloo calls used: `urn:demographics`, `/v2/insights/compare`, `/v2/audiences` with `signal.demographics.audiences`, `filter.popularity.max`, cross-domain `signal.interests.entities`, and heatmap cells.
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

- A full product, not a demo script: four agents plus Grow and Ask that chain themselves, a creator mode, four guided tours (creators and ad teams, US and India), evidence on every number, a shareable report and a Meta export.
- It disagrees with you when the data does: wrong assumptions get a number, not a polite yes.
- Every swap must beat the original in Qloo's data before it is proposed.
- The model is taught to connect signals: every deep-dive insight combines at least two Qloo signals, and code enforces it.
- It works beyond the metros, across countries, for cause campaigns as well as products, and for solo creators as well as agencies.

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
2. The site opens on **For creators**. Click **Take the tour** (a thrift-fit TikToker in Atlanta) or **or the India version** (a street-food Reels creator in Delhi): one line in, then the cities to grow into, a post plan and AI mock-up per city, collabs, brand deals, a pre-test, a rewrite with before/after mock-ups and a small boost. About 3 minutes; you click each step yourself.
   Then switch to **For ad teams** and take that tour: a fictional music festival (EchoFest) touring five cities, in the US or India. About 4 minutes.
3. Then try your own request on the home page, for example:
   - `Launching a canned cold coffee for college students in Mumbai, Bengaluru and Kolkata: insights, a script and 3 Reel ideas`
   - `Make our coffee ad for Chennai with Hindi songs, they'll love it`
   - `Who could be our cricket ambassador in London and Mumbai?`
   - Switch to **For creators** and try `I make street food Reels in Delhi. Which cities would love my content next?`
   - Upload any ad image or short video and ask `Will this work in New York, Atlanta and Miami?`
4. Click any small number next to a claim to see the Qloo data behind it. **Share report** opens a one-page summary.

The first request after a quiet period can take up to a minute while the free server wakes up. New requests make live Qloo and model calls (20–60 seconds); the tour and repeated requests are instant.
