# Project Plan

## Product goal
Build a full-stack AI trip planner that generates customizable day-by-day itineraries from a destination, dates, budget, group type, interests, pace, dietary preferences, and notes.

## Architecture
- **Frontend:** React + Vite for trip criteria, API requests, itinerary days, and future saved trips.
- **Backend:** FastAPI with Pydantic validation and a generation service boundary.
- **Generation:** Start with a deterministic mock provider; add an LLM provider after the API/UI contract stabilizes.
- **Persistence:** Supabase Postgres and Auth. Use row-level security; keep service-role keys backend-only.
- **Quality:** pytest for validation/generation plus production frontend builds.

## Milestones
1. Foundation: scaffold, request/response schemas, health check, mock generation, starter UI.
2. Itinerary UX: responsive results, loading/error states, edit and regenerate flows.
3. Data: Supabase setup, authentication, migrations, and saved-trip CRUD.
4. GenAI: provider interface, prompt template, structured-output parsing, timeouts, retries, and cost controls.
5. Quality: tests, linting, privacy review, and deployment configuration.
6. Demo: solo, couple, and group scenarios; setup instructions and known limitations.

## Constraints
- Do not commit secrets or real `.env` files.
- Keep privileged Supabase credentials on the backend only.
- External LLM usage should be opt-in; mock generation remains available for demos/tests.
- Do not present mock costs, routes, opening hours, or availability as verified facts.
- Never claim a trip is saved to an account until authentication and persistence exist.
- Validate trip dates and budgets; label cost estimates.

## Initial API
- `GET /health`
- `POST /api/itineraries/generate`

OpenAPI docs are available at `/docs` when the backend runs.
