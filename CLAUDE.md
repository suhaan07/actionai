# Action AI

Cultural strategist agent for ad teams, built for the Qloo Agentic Hackathon (due 31 Oct 2026, 9:15 AM IST; target submit 29 Oct).

The full product brief and build plan is in [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md). Read it before planning or building any module.

Rules that override convenience:
- Qloo must be the reason the agent beats a plain LLM. Every route, score and swap carries the Qloo entity/tag IDs behind it.
- Fit checks are "pre-testing", never "A/B testing". Budget splits are a "starting split", never ROAS or "most effective".
- The sensitivity check (module 16) is never cut, and never auto-approves.
- Aggregate regional taste only; never profile private individuals.
- API keys live in server env vars, never in the repo.

Stack: React + Vite + TypeScript + Tailwind (Vercel), FastAPI (Render), Gemini 2.5, Supabase, MIT license.
