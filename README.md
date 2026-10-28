# Personalized Travel Itinerary Planner

A full-stack travel planning app that turns a destination, dates, budget, and travel preferences into a practical day-by-day itinerary. It runs in demo mode without external accounts; optional live AI generation and account-backed trip storage require configuration.

**Stack:** React + Vite · FastAPI + Python · Supabase · optional LLM provider

## Features
- Trip form with dates, total budget, traveller count/type, interests, pace, food preference, and notes
- Day-by-day activity and meal suggestions, practical notes, and clearly labeled estimates
- Deterministic demo itinerary when no LLM provider is configured
- Optional OpenAI-compatible chat completions provider, called only by FastAPI
- Edit activities, regenerate a day without replacing other days, and regenerate the whole plan
- Optional Supabase Auth and user-owned saved trip list/open/update/delete
- Responsive layout and field labels, keyboard focus styles, loading/error states

## Repository layout
```text
frontend/       React + Vite app
backend/        FastAPI app and itinerary logic
supabase/       Database schema and setup notes
docs/           Architecture, milestones, and project notes
.env.example    Environment variable reference
```

## Prerequisites
- Node.js 20+ and npm
- Python 3.11+
- Git
- Supabase project and LLM key are optional for the first local milestone

## Run locally

### Backend (Windows PowerShell)
```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload
```

### Backend (macOS/Linux)
```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

API docs: http://127.0.0.1:8000/docs · Health: http://127.0.0.1:8000/health

### Frontend (new terminal)

Windows PowerShell:
```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

macOS/Linux:
```bash
cd frontend
npm ci
npm run dev
```

Before starting Vite, copy `frontend/.env.example` to `frontend/.env.local` if enabling Supabase or using a separately hosted API. Use `Copy-Item .env.example .env.local` from `frontend/` in PowerShell or `cp .env.example .env.local` on macOS/Linux. Leave optional values blank for local demo mode. The Vite development server proxies `/api` requests to `http://127.0.0.1:8000`, so the frontend and backend work together without a hard-coded browser API host. For a separately hosted API, set `VITE_API_BASE_URL` to its origin and set `CORS_ORIGINS` on the backend to the exact frontend origins.

## Checks

From `backend/`, run `py -3.11 -m pytest -q` (Windows) or `python3.11 -m pytest -q` (macOS/Linux). From `frontend/`, run `npm.cmd test` and `npm.cmd run build` in Windows PowerShell, or `npm test` and `npm run build` on macOS/Linux. Backend tests cover request validation, demo generation, regeneration, and owner-scoped API behavior. Frontend tests cover form and budget logic, React itinerary/account journeys, API payloads, response validation, and error messages. External Supabase and live AI services require project credentials and are not replaced by those tests.

## Pages

The React Router routes are `/` (Home), `/login`, `/signup`, `/plan-trip`, `/itinerary/:id`, and `/saved-trips`. Generated demo itineraries use the `current` ID and are kept in the current browser session. Saved itinerary IDs are loaded from Supabase after sign-in. Unknown routes show a not-found page. A production static host must rewrite these app paths to `index.html` so direct route loads reach the client router.

## How the app works

1. The React page collects trip preferences and sends them as JSON to FastAPI.
2. FastAPI checks the dates, budget, group size, and other fields. It uses the built-in demo generator when live AI settings are absent in development, or calls the configured LLM from the server.
3. The backend validates the returned itinerary before React displays it. React keeps edits in the page and recalculates the visible cost summary.
4. If Supabase is configured, the browser signs in through Supabase Auth. The API checks the sign-in token, then sends it with database requests; Supabase row-level security limits those requests to that user's trips.

An API is the part of the backend that accepts structured requests from the browser. Row-level security (RLS) is a database rule that limits which rows a signed-in user can read or change. Demo trips are held in the current page only until saved to a configured Supabase account.

## Manual completion checklist

### Local demo workflow (no external credentials)

1. Start FastAPI and Vite in separate terminals using the commands above.
2. Navigate between Home, Plan a Trip, Itinerary Details, and Saved Trips; confirm only the selected page's content is shown.
3. Create a three-day trip with a destination, budget, group size, interests, and pace. Confirm three dated days appear with the **Demo recommendations and illustrative cost estimates** label.
4. Try an end date before the start date, a zero budget, no interests, and a trip longer than 31 days. Confirm the form/API reports a helpful error.
5. Edit an activity name or cost. Confirm the itinerary total and budget status change and unsaved edits are shown.
6. Regenerate one day. Confirm its suggestions change while the other days remain intact.
7. Regenerate the whole trip and confirm that the replacement warning appears first.
8. Stop FastAPI and submit a plan. Confirm the error explains that the planner API is unreachable, then restart it and submit successfully.
9. Check layouts at approximately 375px, 768px, 1024px, and 1440px. Confirm the navigation opens at smaller widths, content stacks without clipping, and the page does not scroll horizontally.
10. Use keyboard-only navigation and check labels, focus visibility, and form error announcements.

### Optional integrations

1. For Supabase, apply the schema, configure Auth email confirmation and redirect settings, then sign up, sign in, save, reopen, edit, and delete a trip.
2. Create a second test account and verify that it cannot list, open, update, or delete the first account's trip.
3. For live AI, configure a provider and verify valid output plus a controlled error for a timeout or invalid response. Provider calls may cost money; check the provider's pricing and limits before testing.
4. For deployment, set production environment values and CORS origins, then repeat the sign-in, generation, and ownership checks over HTTPS.

## Configuration

Use `backend/.env.example` for backend settings and `frontend/.env.example` for browser-safe Vite settings. Both contain placeholders only. Copy them to `backend/.env` and `frontend/.env.local` respectively. `VITE_API_BASE_URL` is only needed when the API is not served through the same origin. `VITE_SUPABASE_REDIRECT_URL` is optional and defaults to the current site's `/login?confirmed=1` URL. Never commit local env files. The frontend receives only Supabase's public publishable key; never put a service-role key in a `VITE_` variable. The root `.env.example` remains a combined reference template.

For live AI, configure `LLM_API_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, and optionally `LLM_TIMEOUT_SECONDS` in `backend/.env`. The backend appends `/chat/completions`. In development, missing settings select the clearly labeled mock provider; in production, missing live AI settings return a setup error. Configured live generation is limited by `AI_RATE_LIMIT_REQUESTS` per `AI_RATE_LIMIT_WINDOW_SECONDS` per client IP (defaults: 10 requests per 60 seconds, in this API process). This is a basic single-process guard, not a complete public-production spend control: also set provider-side spending limits and enforce shared rate limits at the gateway when running multiple workers or instances.

For authentication and persistence, create a Supabase project and apply `supabase/schema.sql` in its SQL Editor. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `backend/.env` and `VITE_SUPABASE_URL` plus `VITE_SUPABASE_PUBLISHABLE_KEY` in `frontend/.env.local`. The browser uses Supabase Auth, and the API validates the user's token and uses it for database calls; row-level security restricts records to their owner. No service-role key is needed. For email confirmation, allow the frontend origin's `/login?confirmed=1` URL in Supabase Dashboard → Authentication → URL Configuration → Redirect URLs (or set `VITE_SUPABASE_REDIRECT_URL` to another allowlisted callback). The site URL should match your deployed frontend origin. Restart Vite after changing frontend environment variables.

Saved estimates total only the listed activities and meals; accommodation and transport are not priced. AI suggestions and prices are not live-verified; check current details before booking.

## Milestones
1. Existing scaffold, API schema, health check, mock generator, and UI
2. Activity editing and whole/day regeneration
3. Optional LLM provider and Supabase account-backed saved trips
4. Expanded automated checks and deployment configuration

## Deployment notes

This repository does not include a deployment-provider-specific setup. Deploy the Vite frontend as a static site and FastAPI as a Python web service. Set `VITE_API_BASE_URL` to the HTTPS API origin when frontend and API are separate; set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and (when needed) `VITE_SUPABASE_REDIRECT_URL` as frontend build environment values. Set `LLM_API_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `APP_ENV=production`, and exact HTTPS `CORS_ORIGINS` on the API host. Apply the SQL schema to the intended Supabase project and allow the exact frontend callback URL in Supabase Auth Redirect URLs; set the Auth Site URL to the frontend origin. Configure the static host to rewrite app routes to `index.html`, terminate TLS at the host, keep private keys in host secret settings, and enforce provider spend caps plus shared rate limits. Test sign-in, generation, and cross-account trip ownership over HTTPS before public launch. External LLM calls may incur provider charges.

## Accuracy note
Generated travel suggestions are planning aids, not live booking confirmations. Do not treat mock suggestions, prices, opening hours, routes, or availability as verified facts. Verify current details before travelling.

## Development
See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md).

## License
No license has been selected yet; do not assume the code is licensed for reuse.
