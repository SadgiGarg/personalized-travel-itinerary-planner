from datetime import date
import pytest
from pydantic import ValidationError
from app.schemas import TripRequest
from app.services.itinerary_service import generate_itinerary
from app.main import app, supabase_headers
from fastapi.testclient import TestClient
from app.services import llm_service
import httpx


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


def test_rejects_whitespace_destination():
    with pytest.raises(ValidationError):
        sample_request(destination="   ")


def test_mock_response_labels_demo_mode_and_cost_estimates():
    result = generate_itinerary(sample_request())
    assert result.provider == "demo mock"
    assert result.budget_status == "within_budget"
    assert result.days[0].activities[0].duration_minutes == 120
    assert "estimates" in result.disclaimer.lower()


def test_health_and_generation_endpoints(monkeypatch):
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.delenv("LLM_API_BASE_URL", raising=False)
    monkeypatch.delenv("LLM_MODEL", raising=False)
    monkeypatch.setenv("APP_ENV", "development")
    client = TestClient(app)
    assert client.get("/api/v1/health").json()["status"] == "ok"
    response = client.post("/api/itineraries/generate", json={
        "destination": "Jaipur", "start_date": "2027-01-10", "end_date": "2027-01-12",
        "budget": 12000, "travelers": 2, "interests": ["culture"],
    })
    assert response.status_code == 200
    assert len(response.json()["days"]) == 3
    assert response.json()["provider"] == "demo mock"


def test_cors_allows_local_frontend_preflight():
    response = TestClient(app).options("/api/v1/itineraries/generate", headers={
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    })
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_legacy_generation_and_day_regeneration_routes(monkeypatch):
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.delenv("LLM_API_BASE_URL", raising=False)
    monkeypatch.delenv("LLM_MODEL", raising=False)
    monkeypatch.setenv("APP_ENV", "development")
    client = TestClient(app)
    request = sample_request()
    generated = client.post("/api/itineraries/generate", json=request.model_dump(mode="json"))
    assert generated.status_code == 200
    refreshed = client.post("/api/itineraries/regenerate-day", json={
        "trip": request.model_dump(mode="json"), "itinerary": generated.json(), "day_number": 2,
    })
    assert refreshed.status_code == 200
    assert len(refreshed.json()["days"]) == 3


def test_day_regeneration_rejects_trip_mismatch():
    request = sample_request()
    itinerary = generate_itinerary(request)
    response = TestClient(app).post("/api/v1/itineraries/regenerate-day", json={
        "trip": sample_request(destination="Goa").model_dump(mode="json"),
        "itinerary": itinerary.model_dump(mode="json"), "day_number": 2,
    })
    assert response.status_code == 422


def test_day_regeneration_rejects_misnumbered_itinerary():
    request = sample_request()
    itinerary = generate_itinerary(request).model_dump(mode="json")
    itinerary["days"][1]["day"] = 4
    response = TestClient(app).post("/api/v1/itineraries/regenerate-day", json={
        "trip": request.model_dump(mode="json"), "itinerary": itinerary, "day_number": 2,
    })
    assert response.status_code == 422


def test_api_rejects_invalid_trip_input():
    client = TestClient(app)
    response = client.post("/api/v1/itineraries/generate", json={
        "destination": " ", "start_date": "2027-01-12", "end_date": "2027-01-10", "budget": 0,
    })
    assert response.status_code == 422


def test_trip_storage_requires_authentication():
    client = TestClient(app)
    assert client.get("/api/v1/trips").status_code == 401


def test_supabase_database_headers_keep_user_jwt_and_use_anon_key(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://project.example")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "public-test-key")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "privileged-test-key")
    headers = supabase_headers("user-jwt")
    assert headers["apikey"] == "public-test-key"
    assert headers["Authorization"] == "Bearer user-jwt"
    assert "privileged-test-key" not in headers.values()


def test_trip_storage_sends_owner_scoped_row_and_returns_saved_trip(monkeypatch):
    request = sample_request()
    itinerary = generate_itinerary(request)
    monkeypatch.setattr("app.main.authenticated_user", lambda token: {"id": "user-123"})
    captured = {}

    def fake_db_request(method, path, token, **kwargs):
        captured.update(method=method, path=path, token=token, row=kwargs["json"])
        return [{"id": "trip-123", **kwargs["json"]}]

    monkeypatch.setattr("app.main.db_request", fake_db_request)
    response = TestClient(app).post("/api/v1/trips", headers={"Authorization": "Bearer test-token"}, json={
        "trip": request.model_dump(mode="json"), "itinerary": itinerary.model_dump(mode="json"),
    })
    assert response.status_code == 201
    assert captured["method"] == "POST"
    assert captured["row"]["user_id"] == "user-123"
    assert captured["row"]["itinerary"]["result"]["destination"] == "Jaipur"


def test_trip_lookup_forwards_user_token_and_handles_rls_filtered_rows(monkeypatch):
    """The PostgREST double models empty results that RLS returns to non-owners."""
    owners = {"owner-token": "user-123", "other-token": "user-456"}
    trip_id = "efb9e69c-5189-4055-82a2-7e253c261211"
    row = {"id": trip_id, "user_id": "user-123", "destination": "Jaipur"}
    observed_tokens = []

    monkeypatch.setattr("app.main.authenticated_user", lambda token: {"id": owners[token]})

    def rls_filtered_request(method, path, token, **kwargs):
        observed_tokens.append(token)
        return [row] if owners[token] == row["user_id"] else []

    monkeypatch.setattr("app.main.db_request", rls_filtered_request)
    client = TestClient(app)
    owner = client.get(f"/api/v1/trips/{trip_id}", headers={"Authorization": "Bearer owner-token"})
    other_user = client.get(f"/api/v1/trips/{trip_id}", headers={"Authorization": "Bearer other-token"})
    assert owner.status_code == 200
    assert owner.json()["destination"] == "Jaipur"
    assert other_user.status_code == 404
    assert observed_tokens == ["owner-token", "other-token"]


def test_trip_crud_forwards_user_token_and_respects_rls_for_list_update_delete(monkeypatch):
    request = sample_request()
    itinerary = generate_itinerary(request)
    trip_id = "efb9e69c-5189-4055-82a2-7e253c261211"
    rows = [{"id": trip_id, "user_id": "user-123", "destination": "Jaipur",
             "itinerary": {"trip": request.model_dump(mode="json"),
                           "result": itinerary.model_dump(mode="json")}}]
    owners = {"owner-token": "user-123", "other-token": "user-456"}
    observed = []
    monkeypatch.setattr("app.main.authenticated_user", lambda token: {"id": owners[token]})

    def rls_request(method, path, token, **kwargs):
        observed.append((method, token))
        owner_id = owners[token]
        visible = [row for row in rows if row["user_id"] == owner_id]
        if method == "GET" and "order=updated_at.desc" in path:
            return [{"id": row["id"], "destination": row["destination"]} for row in visible]
        if not visible:
            return []
        if method == "PATCH":
            visible[0].update(kwargs["json"])
            return visible
        if method == "DELETE":
            rows.remove(visible[0])
            return [{"id": trip_id}]
        return visible

    monkeypatch.setattr("app.main.db_request", rls_request)
    client = TestClient(app)
    owner_headers = {"Authorization": "Bearer owner-token"}
    other_headers = {"Authorization": "Bearer other-token"}

    listed = client.get("/api/v1/trips", headers=owner_headers)
    assert listed.status_code == 200
    assert listed.json()[0]["destination"] == "Jaipur"
    assert client.get("/api/v1/trips", headers=other_headers).json() == []

    payload = {"trip": request.model_dump(mode="json"),
               "itinerary": itinerary.model_dump(mode="json")}
    updated = client.patch(f"/api/v1/trips/{trip_id}", headers=owner_headers, json=payload)
    assert updated.status_code == 200
    assert client.patch(f"/api/v1/trips/{trip_id}", headers=other_headers, json=payload).status_code == 404
    assert client.delete(f"/api/v1/trips/{trip_id}", headers=other_headers).status_code == 404
    assert client.delete(f"/api/v1/trips/{trip_id}", headers=owner_headers).status_code == 204
    assert observed == [("GET", "owner-token"), ("GET", "other-token"),
                       ("PATCH", "owner-token"), ("PATCH", "other-token"),
                       ("DELETE", "other-token"), ("DELETE", "owner-token")]


def test_live_ai_rate_limit_rejects_excess_generation_requests(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "test-only")
    monkeypatch.setenv("LLM_API_BASE_URL", "https://llm.example/v1")
    monkeypatch.setenv("LLM_MODEL", "sample")
    monkeypatch.setenv("AI_RATE_LIMIT_REQUESTS", "1")
    monkeypatch.setenv("AI_RATE_LIMIT_WINDOW_SECONDS", "60")
    monkeypatch.setattr("app.main._ai_rate_limit_hits", {})
    monkeypatch.setattr("app.main.generate", lambda request: generate_itinerary(request))
    client = TestClient(app)
    payload = sample_request().model_dump(mode="json")
    assert client.post("/api/v1/itineraries/generate", json=payload).status_code == 200
    limited = client.post("/api/v1/itineraries/generate", json=payload)
    assert limited.status_code == 429
    assert "Too many itinerary requests" in limited.json()["detail"]


def test_supabase_schema_has_owner_policies_for_trip_crud():
    from pathlib import Path

    schema = (Path(__file__).resolve().parents[2] / "supabase" / "schema.sql").read_text(encoding="utf-8")
    assert "alter table public.trips enable row level security" in schema.lower()
    for operation in ("select", "insert", "update", "delete"):
        assert f"for {operation} to authenticated" in schema.lower()
    assert schema.lower().count("auth.uid() = user_id") >= 4


def test_day_regeneration_keeps_other_days(monkeypatch):
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.delenv("LLM_API_BASE_URL", raising=False)
    monkeypatch.delenv("LLM_MODEL", raising=False)
    monkeypatch.setenv("APP_ENV", "development")
    client = TestClient(app)
    request = sample_request()
    itinerary = generate_itinerary(request).model_dump(mode="json")
    before = itinerary["days"][0]
    response = client.post("/api/v1/itineraries/regenerate-day", json={
        "trip": request.model_dump(mode="json"), "itinerary": itinerary, "day_number": 2,
    })
    assert response.status_code == 200
    assert response.json()["days"][0] == before
    assert len(response.json()["days"]) == 3
    assert [item["title"] for item in response.json()["days"][1]["activities"]] != [
        item["title"] for item in itinerary["days"][1]["activities"]
    ]


def test_unknown_activity_cost_is_allowed():
    request = sample_request()
    result = generate_itinerary(request).model_dump(mode="json")
    result["days"][0]["activities"][0]["estimated_cost"] = None
    from app.schemas import TripResponse
    assert TripResponse.model_validate(result).days[0].activities[0].estimated_cost is None


def test_live_provider_validates_and_marks_provider(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "test-only")
    monkeypatch.setenv("LLM_API_BASE_URL", "https://llm.example/v1")
    monkeypatch.setenv("LLM_MODEL", "sample")
    mock_response = generate_itinerary(sample_request()).model_dump_json()

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": mock_response}}]}

    monkeypatch.setattr(llm_service.httpx, "post", lambda *args, **kwargs: FakeResponse())
    result = llm_service.generate(sample_request())
    assert result.provider == "live"
    assert len(result.days) == 3


def test_live_provider_timeout_is_user_safe(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "test-only")
    monkeypatch.setenv("LLM_API_BASE_URL", "https://llm.example/v1")
    monkeypatch.setenv("LLM_MODEL", "sample")

    def timeout(*args, **kwargs):
        raise httpx.TimeoutException("private provider diagnostic")

    monkeypatch.setattr(llm_service.httpx, "post", timeout)
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        llm_service.generate(sample_request())
    assert exc.value.status_code == 504
    assert "private provider diagnostic" not in exc.value.detail
