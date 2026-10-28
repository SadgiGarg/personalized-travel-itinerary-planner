"""FastAPI entrypoint."""

import os
import threading
import time
from uuid import UUID
from dotenv import load_dotenv
import httpx
from fastapi import FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from app.schemas import RegenerateDayRequest, SaveTripRequest, TripRequest, TripResponse, TripUpdateRequest
from app.services.llm_service import generate

# Load backend/.env for local development; deployment env vars still take precedence.
load_dotenv()

app = FastAPI(title="Personalized Travel Itinerary Planner API", version="0.2.0", description="Generate validated mock or configured LLM itineraries and manage authenticated saved trips.")
origins = [item.strip().rstrip("/") for item in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if item.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

_ai_rate_limit_lock = threading.Lock()
_ai_rate_limit_hits: dict[str, list[float]] = {}


def enforce_live_ai_rate_limit(request: Request) -> None:
    """Apply a modest per-process limit to configured, potentially billable AI calls."""
    if not all(os.getenv(name, "").strip() for name in ("LLM_API_BASE_URL", "LLM_API_KEY", "LLM_MODEL")):
        return
    try:
        limit = int(os.getenv("AI_RATE_LIMIT_REQUESTS", "10"))
        window = int(os.getenv("AI_RATE_LIMIT_WINDOW_SECONDS", "60"))
    except ValueError as exc:
        raise HTTPException(status_code=503, detail="AI rate limit configuration is invalid.") from exc
    if limit < 1 or window < 1:
        raise HTTPException(status_code=503, detail="AI rate limit configuration is invalid.")
    client_ip = request.client.host if request.client else "unknown"
    now = time.monotonic()
    with _ai_rate_limit_lock:
        cutoff = now - window
        hits = [hit for hit in _ai_rate_limit_hits.get(client_ip, []) if hit > cutoff]
        if len(hits) >= limit:
            _ai_rate_limit_hits[client_ip] = hits
            raise HTTPException(status_code=429, detail="Too many itinerary requests. Please try again shortly.")
        hits.append(now)
        _ai_rate_limit_hits[client_ip] = hits

@app.get("/health")
@app.get("/api/v1/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "travel-itinerary-api"}

@app.post("/api/itineraries/generate", response_model=TripResponse)
@app.post("/api/v1/itineraries/generate", response_model=TripResponse)
def create_itinerary(request: TripRequest, http_request: Request) -> TripResponse:
    enforce_live_ai_rate_limit(http_request)
    return generate(request)


@app.post("/api/itineraries/regenerate-day", response_model=TripResponse)
def regenerate_day_legacy(body: RegenerateDayRequest, http_request: Request) -> TripResponse:
    return regenerate_day(body, http_request)


@app.post("/api/v1/itineraries/regenerate-day", response_model=TripResponse)
def regenerate_day(body: RegenerateDayRequest, http_request: Request) -> TripResponse:
    enforce_live_ai_rate_limit(http_request)
    if body.day_number > len(body.itinerary.days):
        raise HTTPException(status_code=404, detail="That itinerary day does not exist.")
    previous = next(day for day in body.itinerary.days if day.day == body.day_number)
    refreshed = generate(body.trip, excluded_titles=[activity.title for activity in previous.activities])
    refreshed_day = next((day for day in refreshed.days if day.day == body.day_number), None)
    if refreshed_day is None:
        raise HTTPException(status_code=502, detail="Could not regenerate that day.")
    days = [refreshed_day if day.day == body.day_number else day for day in body.itinerary.days]
    body.itinerary.days = days
    costs = [a.estimated_cost for day in days for a in day.activities]
    costs += [m.estimated_cost for day in days for m in day.meals]
    body.itinerary.estimated_total = round(sum(v for v in costs if v is not None), 2) if all(v is not None for v in costs) else None
    body.itinerary.budget_remaining = round(body.itinerary.budget - body.itinerary.estimated_total, 2) if body.itinerary.estimated_total is not None else None
    body.itinerary.budget_status = "unknown" if body.itinerary.estimated_total is None else ("within_budget" if body.itinerary.estimated_total <= body.itinerary.budget else "over_budget")
    return body.itinerary


def supabase_headers(token: str, prefer: str | None = None) -> dict[str, str]:
    key = os.getenv("SUPABASE_ANON_KEY", "").strip()
    if not os.getenv("SUPABASE_URL", "").strip() or not key:
        raise HTTPException(status_code=503, detail="Trip storage is not configured.")
    headers = {"apikey": key, "Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    return headers


def authenticated_user(token: str) -> dict:
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    headers = supabase_headers(token)
    try:
        result = httpx.get(f"{url}/auth/v1/user", headers=headers, timeout=15)
        result.raise_for_status()
        user = result.json()
        if not isinstance(user, dict) or not user.get("id"):
            raise ValueError("Supabase returned an invalid user response")
        return user
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Your sign-in session is invalid or expired.") from exc


def db_request(method: str, path: str, token: str, **kwargs):
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    try:
        result = httpx.request(method, f"{url}/rest/v1/{path}", headers=supabase_headers(token, kwargs.pop("prefer", None)), timeout=20, **kwargs)
        if result.status_code == 404:
            try:
                error = result.json()
            except ValueError:
                error = {}
            if error.get("code") == "PGRST205":
                raise HTTPException(status_code=503, detail="The saved trips table is not installed. Apply supabase/schema.sql to your project.")
            raise HTTPException(status_code=404, detail="Trip not found.")
        if result.status_code in (401, 403):
            raise HTTPException(status_code=403, detail="You do not have access to this trip.")
        result.raise_for_status()
        return result.json() if result.content else None
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Trip storage could not complete the request.") from exc


def bearer(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Sign in to manage saved trips.")
    return authorization.split(" ", 1)[1]


@app.post("/api/v1/trips", status_code=201)
def save_trip(body: SaveTripRequest, authorization: str | None = Header(default=None)):
    token = bearer(authorization)
    user = authenticated_user(token)
    trip = body.trip
    itinerary = body.itinerary
    row = {"user_id": user["id"], "title": f"{trip.destination} · {trip.start_date}",
           "destination": trip.destination, "start_date": trip.start_date.isoformat(),
           "end_date": trip.end_date.isoformat(), "currency": trip.currency, "budget": trip.budget,
           "itinerary": {"trip": trip.model_dump(mode="json"), "result": itinerary.model_dump(mode="json")}}
    rows = db_request("POST", "trips?select=*", token, json=row, prefer="return=representation")
    return rows[0]


@app.get("/api/v1/trips")
def list_trips(authorization: str | None = Header(default=None)):
    token = bearer(authorization)
    authenticated_user(token)
    return db_request("GET", "trips?select=id,title,destination,start_date,end_date,currency,budget,created_at,updated_at&order=updated_at.desc", token)


@app.get("/api/v1/trips/{trip_id}")
def get_trip(trip_id: UUID, authorization: str | None = Header(default=None)):
    token = bearer(authorization)
    authenticated_user(token)
    rows = db_request("GET", f"trips?id=eq.{trip_id}&select=*", token)
    if not rows:
        raise HTTPException(status_code=404, detail="Trip not found.")
    return rows[0]


@app.patch("/api/v1/trips/{trip_id}")
def update_trip(trip_id: UUID, body: TripUpdateRequest, authorization: str | None = Header(default=None)):
    token = bearer(authorization)
    authenticated_user(token)
    value = body.itinerary
    trip = body.trip
    row = {"destination": trip.destination if trip else value.destination,
           "start_date": (trip.start_date if trip else value.start_date).isoformat(),
           "end_date": (trip.end_date if trip else value.end_date).isoformat(),
           "currency": trip.currency if trip else value.currency, "budget": trip.budget if trip else value.budget,
           "itinerary": {"trip": trip.model_dump(mode="json") if trip else None, "result": value.model_dump(mode="json")}}
    updated = db_request("PATCH", f"trips?id=eq.{trip_id}&select=*", token, json=row, prefer="return=representation")
    if not updated:
        raise HTTPException(status_code=404, detail="Trip not found.")
    return updated[0]


@app.delete("/api/v1/trips/{trip_id}", status_code=204)
def delete_trip(trip_id: UUID, authorization: str | None = Header(default=None)):
    token = bearer(authorization)
    authenticated_user(token)
    rows = db_request("DELETE", f"trips?id=eq.{trip_id}&select=id", token, prefer="return=representation")
    if not rows:
        raise HTTPException(status_code=404, detail="Trip not found.")
    return Response(status_code=204)
