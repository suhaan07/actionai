# Qloo hackathon API — notes

Source: [Qloo LLM Hackathon Developer Guide](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide), read 20 Oct 2026.

## Basics

- Base URL: `https://hackathon.api.qloo.com`. Hackathon keys fail on staging/prod with a 401.
- Auth: `X-Api-Key` header only. Not Bearer, not a query param.
- Every endpoint is **GET** with query-string params. POST returns 404.

## Endpoints

| Path | Use |
| --- | --- |
| `GET /v2/insights` | Main endpoint. `filter.type` is required on every call |
| `GET /search` | Name → entity ID |
| `GET /v2/tags` | Keyword → tag ID |

Not supported: `/recommendations`, `/recs`, `/v2/insights/search`.
`/v2/audiences` is **not listed** in the guide (our brief assumed it). Check before relying on it.

## Entity types (`filter.type`)

`urn:entity:artist`, `book`, `brand`, `destination`, `movie`, `person`, `place`, `podcast`, `tv_show`, `video_game`.

- Music is `artist`, not `music`.
- There is **no food type**. Food goes through `place` (restaurants by cuisine) or `brand`, or through tags.
- 403 "You do not have permission to access urn:entity:…" means the type isn't allowed.

## Parameters named in the guide

`filter.type`, `filter.tags`, `signal.interests.entities`, `signal.interests.tags`, `signal.demographics.audiences`.

- Tag params need real tag IDs from `/v2/tags`, not free text.
- Audience values must be valid audience URNs (the guide doesn't list them).
- **Unknown params are silently ignored.** An empty `entities` array can mean a bad param, not missing data.

Still to confirm in the Parameter Reference / Entity Type Parameter Guide (not in this page): `signal.location.query`, `signal.location` + `radius`, `filter.location.query`, `signal.demographics.age` / `gender`, `filter.results.entities`, `filter.exclude.entities`, `bias.trends`, `filter.type=urn:tag`, `filter.type=urn:demographics`. Our scoring, profiles and swaps depend on these.

## Errors

| Response | Cause |
| --- | --- |
| 401 | Wrong base URL |
| 401 "No API key found in request" | Key missing / wrong header |
| 404 "No path matching request parameters" | POST, or a bad path |
| "at least one valid signal or filter is required" | Bad tag IDs or audience values |
| 200 with empty `entities` | Bad params for this `filter.type`, or no data |

## Limits and data rules

- No published numbers; quotas "high enough". Ask in #api-help on the hackathon Discord to raise them.
- Keys work through judging, then get deactivated.
- **Private server-side caching is allowed, no time limit** (our Supabase cache is fine).
- **Never commit Qloo response data to the public repo.** Keep cached responses in Supabase only; no JSON dumps in git.
- Responses can't be trimmed server-side (e.g. `akas`). Strip fields in our backend before sending to the browser.

## Probed 22 Oct 2026 (hackathon key)

Works:
- `filter.type=urn:demographics` + `signal.interests.entities` → age-band and gender skew of an entity's fans (−1…1). Entities only; tags return nothing.
- `filter.popularity.max` / `.min` on any entity list → niche or mainstream picks. Every result carries `popularity` (0–1) and `query.affinity` (0–1).
- Cross-domain: `signal.interests.entities` with another `filter.type` (brand, podcast, tv_show, place…) → what fans of X also like. Add `filter.location.query` for places in a city; places carry `location.lat/lon`.
- `filter.type=urn:tag` + `signal.interests.entities` → tags fans of X over-index on.
- `filter.results.entities` → affinity of named entities against a signal (e.g. a city).
- `GET /v2/insights/compare` with `a.signal.interests.entities` and `b.signal.interests.entities` → the tags that set each side apart, including Qloo's style, theme and audience tags (`urn:tag:style:qloo:vibrant`, `urn:tag:theme:qloo:urban_life`, `urn:tag:audience:qloo:devoted`).
- `GET /v2/audiences?filter.audience.types=…` lists audience URNs (communities, hobbies_and_interests, global_issues, investing_interests), e.g. `urn:audience:hobbies_and_interests:health_and_beauty`. `/v2/audiences/types` lists the types.
- `bias.trends=high` is accepted; `query.measurements.audience_growth` came back 0.
- `urn:entity:podcast` works.

Doesn't (or not usefully):
- `urn:entity:video_game` is not supported for `filter.type`.
- `GET /v2/trending` needs `filter.type`, `filter.start_date`, `filter.end_date`; returned an empty list for a well-known artist.
- `/v2/tags?filter.query=street food` returned nothing; cuisine tags need another route.
