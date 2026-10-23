from datetime import date
import pytest
from pydantic import ValidationError
from app.schemas import TripRequest
from app.services.itinerary_service import generate_itinerary


def sample_request(**overrides):
    values = {"destination": "Jaipur", "start_date": date(2027, 1, 10), "end_date": date(2027, 1, 12), "budget": 12000, "currency": "INR", "travelers": 2, "traveler_type": "couple", "travel_style": "balanced", "interests": ["culture", "food"]}
    values.update(overrides)
    return TripRequest(**values)


def test_generates_one_day_entry_per_calendar_day():
    result = generate_itinerary(sample_request())
    assert len(result.days) == 3
    assert result.days[0].date == date(2027, 1, 10)
    assert result.days[-1].date == date(2027, 1, 12)


def test_estimate_is_within_budget_for_default_mock():
    result = generate_itinerary(sample_request())
    assert result.estimated_total <= result.budget
    assert result.budget_remaining >= 0


def test_rejects_end_date_before_start_date():
    with pytest.raises(ValidationError):
        sample_request(start_date=date(2027, 1, 12), end_date=date(2027, 1, 10))


def test_rejects_too_long_trip():
    with pytest.raises(ValidationError):
        sample_request(end_date=date(2027, 2, 20))
