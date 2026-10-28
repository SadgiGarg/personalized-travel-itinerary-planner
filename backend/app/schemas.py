"""Validated API schemas for trip planning."""

from datetime import date
from enum import Enum
from pydantic import BaseModel, Field, model_validator, field_validator


class TravelStyle(str, Enum):
    relaxed = "relaxed"
    balanced = "balanced"
    packed = "packed"


class TravelerType(str, Enum):
    solo = "solo"
    couple = "couple"
    group = "group"
    family = "family"


def validate_itinerary_days(itinerary: "TripResponse") -> None:
    if itinerary.end_date < itinerary.start_date:
        raise ValueError("Itinerary end date must be on or after its start date")
    count = (itinerary.end_date - itinerary.start_date).days + 1
    if count > 31:
        raise ValueError("Itinerary cannot exceed 31 calendar days")
    dates = [itinerary.start_date.fromordinal(itinerary.start_date.toordinal() + offset) for offset in range(count)]
    if [day.date for day in itinerary.days] != dates or [day.day for day in itinerary.days] != list(range(1, count + 1)):
        raise ValueError("Itinerary must contain each trip day in order")


def validate_trip_matches_itinerary(trip: "TripRequest", itinerary: "TripResponse") -> None:
    if (
        trip.destination.casefold() != itinerary.destination.casefold()
        or trip.start_date != itinerary.start_date
        or trip.end_date != itinerary.end_date
        or trip.currency != itinerary.currency
        or trip.budget != itinerary.budget
        or trip.travelers != itinerary.travelers
    ):
        raise ValueError("Trip preferences must match the itinerary")


class TripRequest(BaseModel):
    destination: str = Field(min_length=2, max_length=120)
    start_date: date
    end_date: date
    budget: float = Field(gt=0, le=10_000_000)
    currency: str = Field(default="INR", pattern=r"^[A-Z]{3}$")
    travelers: int = Field(default=1, ge=1, le=30)
    traveler_type: TravelerType = TravelerType.solo
    travel_style: TravelStyle = TravelStyle.balanced
    interests: list[str] = Field(default_factory=lambda: ["general exploration"], min_length=1, max_length=12)
    dietary_preferences: list[str] = Field(default_factory=list, max_length=8)
    notes: str = Field(default="", max_length=1000)

    @field_validator("destination")
    @classmethod
    def destination_not_blank(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Destination must contain at least two non-space characters")
        return value

    @field_validator("interests", "dietary_preferences")
    @classmethod
    def clean_preferences(cls, values: list[str]) -> list[str]:
        cleaned = [value.strip() for value in values]
        if any(not value or len(value) > 60 for value in cleaned):
            raise ValueError("Preferences must contain between 1 and 60 characters")
        return cleaned

    @model_validator(mode="after")
    def validate_dates(self):
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        if (self.end_date - self.start_date).days > 30:
            raise ValueError("Trips longer than 31 calendar days are not supported yet")
        return self


class Activity(BaseModel):
    id: str = ""
    time: str | None = None
    end_time: str | None = None
    duration_minutes: int | None = Field(default=None, ge=0)
    title: str = Field(min_length=1, max_length=140)
    description: str = Field(min_length=1, max_length=600)
    category: str = "activity"
    estimated_cost: float | None = Field(default=None, ge=0)
    currency: str = Field(default="INR", pattern=r"^[A-Z]{3}$")
    location: str | None = None
    booking_required: bool | None = None
    practical_note: str | None = None


class MealSuggestion(BaseModel):
    meal: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=140)
    notes: str = Field(default="", max_length=400)
    estimated_cost: float | None = Field(default=None, ge=0)
    currency: str = Field(default="INR", pattern=r"^[A-Z]{3}$")


class ItineraryDay(BaseModel):
    day: int = Field(ge=1)
    date: date
    title: str = Field(min_length=1, max_length=140)
    summary: str = Field(default="", max_length=600)
    activities: list[Activity] = Field(default_factory=list)
    meals: list[MealSuggestion] = Field(default_factory=list)
    transport_note: str = ""
    estimated_total: float | None = Field(default=None, ge=0)
    currency: str = Field(default="INR", pattern=r"^[A-Z]{3}$")


class TripResponse(BaseModel):
    destination: str
    start_date: date
    end_date: date
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    budget: float = Field(gt=0, le=10_000_000)
    travelers: int = 1
    estimated_total: float | None = None
    budget_remaining: float | None = None
    budget_status: str = "unknown"
    summary: str
    provider: str = "mock"
    disclaimer: str = ("Costs and recommendations are estimates. Verify current opening hours, "
                       "transport, prices, and availability before travelling.")
    days: list[ItineraryDay]


class TripUpdateRequest(BaseModel):
    itinerary: TripResponse
    trip: TripRequest | None = None

    @model_validator(mode="after")
    def trip_matches_itinerary(self):
        if self.trip:
            validate_trip_matches_itinerary(self.trip, self.itinerary)
        validate_itinerary_days(self.itinerary)
        return self


class SaveTripRequest(BaseModel):
    trip: TripRequest
    itinerary: TripResponse

    @model_validator(mode="after")
    def trip_matches_itinerary(self):
        validate_trip_matches_itinerary(self.trip, self.itinerary)
        validate_itinerary_days(self.itinerary)
        return self


class RegenerateDayRequest(BaseModel):
    trip: TripRequest
    itinerary: TripResponse
    day_number: int = Field(ge=1)

    @model_validator(mode="after")
    def trip_matches_itinerary(self):
        validate_trip_matches_itinerary(self.trip, self.itinerary)
        validate_itinerary_days(self.itinerary)
        return self
