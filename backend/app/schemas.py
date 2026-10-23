"""Validated API schemas for trip planning."""

from datetime import date
from enum import Enum
from pydantic import BaseModel, Field, model_validator


class TravelStyle(str, Enum):
    relaxed = "relaxed"
    balanced = "balanced"
    packed = "packed"


class TravelerType(str, Enum):
    solo = "solo"
    couple = "couple"
    group = "group"
    family = "family"


class TripRequest(BaseModel):
    destination: str = Field(min_length=2, max_length=120)
    start_date: date
    end_date: date
    budget: float = Field(gt=0, le=10_000_000)
    currency: str = Field(default="INR", pattern=r"^[A-Z]{3}$")
    travelers: int = Field(default=1, ge=1, le=30)
    traveler_type: TravelerType = TravelerType.solo
    travel_style: TravelStyle = TravelStyle.balanced
    interests: list[str] = Field(default_factory=list, max_length=12)
    dietary_preferences: list[str] = Field(default_factory=list, max_length=8)
    notes: str = Field(default="", max_length=1000)

    @model_validator(mode="after")
    def validate_dates(self):
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        if (self.end_date - self.start_date).days > 30:
            raise ValueError("Trips longer than 31 calendar days are not supported yet")
        return self


class Activity(BaseModel):
    time: str
    title: str
    description: str
    category: str = "activity"
    estimated_cost: float = Field(ge=0)
    currency: str = "INR"
    location: str | None = None
    booking_required: bool | None = None


class MealSuggestion(BaseModel):
    meal: str
    name: str
    notes: str = ""
    estimated_cost: float = Field(ge=0)
    currency: str = "INR"


class ItineraryDay(BaseModel):
    day: int = Field(ge=1)
    date: date
    title: str
    activities: list[Activity] = Field(default_factory=list)
    meals: list[MealSuggestion] = Field(default_factory=list)
    transport_note: str = ""
    estimated_total: float = Field(ge=0)
    currency: str = "INR"


class TripResponse(BaseModel):
    destination: str
    start_date: date
    end_date: date
    currency: str
    budget: float
    estimated_total: float
    budget_remaining: float
    summary: str
    provider: str = "mock"
    disclaimer: str = ("Costs and recommendations are estimates. Verify current opening hours, "
                       "transport, prices, and availability before travelling.")
    days: list[ItineraryDay]
