"""Deterministic demo itinerary provider; no external API key required."""

from datetime import timedelta
from app.schemas import Activity, ItineraryDay, MealSuggestion, TripRequest, TripResponse

PLACES = {
    "jaipur": [("Amber Fort", "heritage"), ("Hawa Mahal area", "sightseeing"), ("City Palace", "culture"), ("Jantar Mantar", "heritage")],
    "goa": [("Old Goa heritage area", "culture"), ("Panaji waterfront", "sightseeing"), ("Local beach visit", "outdoors"), ("Local market", "shopping")],
    "manali": [("Old Manali", "culture"), ("Hadimba Temple area", "heritage"), ("Nature walk", "outdoors"), ("Local market", "shopping")],
    "indore": [("Rajwada area", "heritage"), ("Sarafa Bazaar", "food"), ("Lal Bagh Palace", "culture"), ("Regional market", "shopping")],
    "delhi": [("Humayun's Tomb", "heritage"), ("India Gate area", "sightseeing"), ("National Museum", "culture"), ("Old Delhi market", "food")],
}


def generate_itinerary(request: TripRequest, excluded_titles: list[str] | None = None) -> TripResponse:
    """Build an illustrative itinerary for development and UI testing."""
    options = PLACES.get(request.destination.strip().lower(), [
        ("Historic centre", "culture"), ("Popular local attraction", "sightseeing"),
        ("Local food district", "food"), ("Public garden or nature area", "outdoors"),
    ])
    if excluded_titles:
        alternatives = [place for place in options if place[0] not in excluded_titles]
        if alternatives:
            options = alternatives
    count = (request.end_date - request.start_date).days + 1
    daily_budget = request.budget / count
    days = []
    for index in range(count):
        date_value = request.start_date + timedelta(days=index)
        first, second = options[(index * 2) % len(options)], options[(index * 2 + 1) % len(options)]
        activity_cost = round(daily_budget * 0.22, 2)
        meal_cost = round(daily_budget * 0.18, 2)
        activities = [
            Activity(id=f"day-{index + 1}-activity-1", time="10:00", end_time="12:00", duration_minutes=120, title=first[0], description=f"Suggested {first[1]} stop. Check local hours and ticket information before visiting.", category=first[1], estimated_cost=activity_cost, currency=request.currency, location=request.destination, practical_note="Confirm current hours and ticket prices before travelling."),
            Activity(id=f"day-{index + 1}-activity-2", time="15:00", end_time="17:00", duration_minutes=120, title=second[0], description=f"Flexible {second[1]} visit; adjust timing to local travel conditions.", category=second[1], estimated_cost=activity_cost, currency=request.currency, location=request.destination, practical_note="Group nearby stops together; route times are not verified."),
        ]
        dietary = ("Respect dietary preferences: " + ", ".join(request.dietary_preferences)) if request.dietary_preferences else "Choose a well-reviewed local option."
        meals = [
            MealSuggestion(meal="Lunch", name="Local restaurant or cafe", notes=dietary, estimated_cost=meal_cost, currency=request.currency),
            MealSuggestion(meal="Dinner", name="Regional cuisine spot", notes="Check recent reviews and opening hours.", estimated_cost=meal_cost, currency=request.currency),
        ]
        total = round(sum(a.estimated_cost or 0 for a in activities) + sum(m.estimated_cost or 0 for m in meals), 2)
        days.append(ItineraryDay(day=index + 1, date=date_value, title=f"Day {index + 1}: Explore {request.destination}", summary="A flexible day with time for a meal and a relaxed break between suggested stops.", activities=activities, meals=meals, transport_note="Group nearby stops together and confirm current local transport options.", estimated_total=total, currency=request.currency))

    total_estimate = round(sum(day.estimated_total for day in days), 2)
    interests = ", ".join(request.interests)
    return TripResponse(destination=request.destination.strip(), start_date=request.start_date, end_date=request.end_date, currency=request.currency, budget=request.budget, travelers=request.travelers, estimated_total=total_estimate, budget_remaining=round(request.budget - total_estimate, 2), budget_status="within_budget" if total_estimate <= request.budget else "over_budget", summary=f"A {count}-day {request.travel_style.value} sample plan for {request.destination}, tailored for a {request.traveler_type.value} trip with {request.travelers} traveller(s). Interests: {interests}.", provider="demo mock", days=days)
