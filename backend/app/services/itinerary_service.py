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


def generate_itinerary(request: TripRequest) -> TripResponse:
    """Build an illustrative itinerary for development and UI testing."""
    options = PLACES.get(request.destination.strip().lower(), [
        ("Historic centre", "culture"), ("Popular local attraction", "sightseeing"),
        ("Local food district", "food"), ("Public garden or nature area", "outdoors"),
    ])
    count = (request.end_date - request.start_date).days + 1
    daily_budget = request.budget / count
    days = []
    for index in range(count):
        date_value = request.start_date + timedelta(days=index)
        first, second = options[(index * 2) % len(options)], options[(index * 2 + 1) % len(options)]
        activity_cost = round(daily_budget * 0.22, 2)
        meal_cost = round(daily_budget * 0.18, 2)
        activities = [
            Activity(time="10:00", title=first[0], description=f"Suggested {first[1]} stop. Check local hours and ticket information before visiting.", category=first[1], estimated_cost=activity_cost, currency=request.currency, location=request.destination),
            Activity(time="15:00", title=second[0], description=f"Flexible {second[1]} visit; adjust timing to local travel conditions.", category=second[1], estimated_cost=activity_cost, currency=request.currency, location=request.destination),
        ]
        dietary = ("Respect dietary preferences: " + ", ".join(request.dietary_preferences)) if request.dietary_preferences else "Choose a well-reviewed local option."
        meals = [
            MealSuggestion(meal="Lunch", name="Local restaurant or cafe", notes=dietary, estimated_cost=meal_cost, currency=request.currency),
            MealSuggestion(meal="Dinner", name="Regional cuisine spot", notes="Check recent reviews and opening hours.", estimated_cost=meal_cost, currency=request.currency),
        ]
        total = round(sum(a.estimated_cost for a in activities) + sum(m.estimated_cost for m in meals), 2)
        days.append(ItineraryDay(day=index + 1, date=date_value, title=f"Day {index + 1}: Explore {request.destination}", activities=activities, meals=meals, transport_note="Group nearby stops together and confirm current local transport options.", estimated_total=total, currency=request.currency))

    total_estimate = round(sum(day.estimated_total for day in days), 2)
    return TripResponse(destination=request.destination.strip(), start_date=request.start_date, end_date=request.end_date, currency=request.currency, budget=request.budget, estimated_total=total_estimate, budget_remaining=round(request.budget - total_estimate, 2), summary=f"A {count}-day {request.travel_style.value} sample plan for {request.destination}, tailored for a {request.traveler_type.value} trip with {request.travelers} traveller(s).", provider="mock", days=days)
