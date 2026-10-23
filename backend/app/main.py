"""FastAPI entrypoint."""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.schemas import TripRequest, TripResponse
from app.services.itinerary_service import generate_itinerary

app = FastAPI(title="Personalized Travel Itinerary Planner API", version="0.1.0", description="Generate illustrative itineraries; external provider integrations are added later.")
origins = [item.strip() for item in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if item.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "travel-itinerary-api"}

@app.post("/api/itineraries/generate", response_model=TripResponse)
def create_itinerary(request: TripRequest) -> TripResponse:
    return generate_itinerary(request)
