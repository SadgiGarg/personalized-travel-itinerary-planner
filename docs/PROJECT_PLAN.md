# Project Plan

## Product goal
Build a full-stack AI trip planner that generates customizable day-by-day itineraries from a destination, dates, budget, group type, interests, pace, dietary preferences, and notes.

## Architecture
- **Frontend:** React + Vite for trip criteria, API requests, itinerary days, and future saved trips.
- **Backend:** FastAPI with Pydantic validation and a generation service boundary.
- **Generation:** Start with a deterministic mock provider; add an LLM provider after the API/UI contract stabilizes.
- **Persistence:** Supabase Postgres and Auth. Use row-level security; keep service-role keys backend-only.
- **Quality:** pytest for validation/generation plus production frontend builds.

## Current status
- Foundation, trip form, mock generation, FastAPI health/generation endpoints, and itinerary display are present.
- Activity edits, whole-itinerary regeneration, and single-day regeneration are implemented in the UI/API.
- Optional OpenAI-compatible generation and Supabase Auth plus user-scoped trip CRUD are configured by environment variables.
- Backend tests and setup/deployment guidance are present but still need to be run in an environment with dependencies installed and real Supabase credentials configured.

## Next milestones
1. Install the documented dependencies in a local development environment and run backend tests plus the frontend production build.
2. Configure a Supabase project and verify signup, row-level security, save/open/update/delete with two users.
3. Configure an OpenAI-compatible provider and verify structured output, timeout and invalid-output behavior.
4. Address any issues found, then complete responsive/accessibility and deployment smoke checks.

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
