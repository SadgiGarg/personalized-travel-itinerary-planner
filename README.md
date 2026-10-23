# Personalized Travel Itinerary Planner

A full-stack GenAI travel planning app that turns a destination, dates, budget, and travel preferences into a practical day-by-day itinerary.

**Stack:** React + Vite · FastAPI + Python · Supabase · optional LLM provider

## Features planned
- Personalized day-wise itineraries for solo trips, couples, and small groups
- Activity, meal, transport notes, and estimated costs
- Budget-aware planning and travel-style preferences
- Save, edit, and regenerate trips (Supabase integration)
- Responsive dashboard and interactive itinerary views
- Mock generation works locally before API credentials are configured

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
```bash
cd frontend
npm install
npm run dev
```

## Environment variables
Copy `backend/.env.example` to `backend/.env`. Never commit real secrets. Mock generation is the default so the project runs before AI or Supabase is configured.

## Milestones
1. Project scaffold, API schema, health check, mock generator, initial UI
2. Itinerary editing, regeneration, loading/error states, and testing
3. Supabase authentication and saved trips
4. Optional LLM provider with validated structured output
5. Deployment, testing, and demo polish

## Accuracy note
Generated travel suggestions are planning aids, not live booking confirmations. Do not treat mock suggestions, prices, opening hours, routes, or availability as verified facts. Verify current details before travelling.

## Development
See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md).

## License
No license has been selected yet; do not assume the code is licensed for reuse.
