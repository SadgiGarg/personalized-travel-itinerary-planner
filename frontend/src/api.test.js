import assert from "node:assert/strict";
import test from "node:test";
import { accountConfigured, formatAuthErrorMessage, generateItinerary, getTrip, listTrips, regenerateDay, saveTrip, signIn } from "./api.js";

test("auth is disabled with a clear error when Supabase frontend variables are missing", async () => {
  assert.equal(accountConfigured, false);
  await assert.rejects(signIn("person@example.com", "password"), /VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY/);
});

test("auth errors explain rate limits, existing accounts, and unconfirmed email", () => {
  assert.match(formatAuthErrorMessage({ message: "email rate limit exceeded" }, "signup"), /Do not retry signup repeatedly/);
  assert.match(formatAuthErrorMessage({ code: "user_already_exists" }, "signup"), /Try logging in/);
  assert.match(formatAuthErrorMessage({ code: "email_not_confirmed" }, "signin"), /waiting for email verification/i);
});

test("itinerary helper posts the planner payload to the versioned endpoint", async () => {
  const previousFetch = globalThis.fetch;
  let requested;
  globalThis.fetch = async (url, options) => {
    requested = { url, options };
    return new Response(JSON.stringify({ destination: "Jaipur", days: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const payload = { destination: "Jaipur", budget: 12000, travelers: 2 };
    const result = await generateItinerary(payload);
    assert.equal(requested.url, "/api/v1/itineraries/generate");
    assert.equal(requested.options.method, "POST");
    assert.deepEqual(JSON.parse(requested.options.body), payload);
    assert.equal(result.destination, "Jaipur");
  } finally { globalThis.fetch = previousFetch; }
});

test("day regeneration helper posts its payload to the versioned endpoint", async () => {
  const previousFetch = globalThis.fetch;
  let requested;
  globalThis.fetch = async (url, options) => {
    requested = { url, options };
    return new Response(JSON.stringify({ destination: "Jaipur", days: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const payload = { trip: { destination: "Jaipur" }, itinerary: { days: [] }, day_number: 1 };
    await regenerateDay(payload);
    assert.equal(requested.url, "/api/v1/itineraries/regenerate-day");
    assert.equal(requested.options.method, "POST");
    assert.deepEqual(JSON.parse(requested.options.body), payload);
  } finally { globalThis.fetch = previousFetch; }
});

test("API helper displays FastAPI validation details", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: [{ msg: "budget must be greater than 0" }] }), { status: 422 });
  try {
    await assert.rejects(generateItinerary({}), /budget must be greater than 0/);
  } finally { globalThis.fetch = previousFetch; }
});

test("API helper explains proxy and server failures without JSON", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("<html>proxy error</html>", { status: 502 });
  try {
    await assert.rejects(listTrips("token"), /HTTP 502.*FastAPI is running/);
  } finally { globalThis.fetch = previousFetch; }
});

test("API helpers reject malformed success responses instead of treating them as saved data", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true }), { status: 200 });
  try {
    await assert.rejects(generateItinerary({}), /invalid itinerary response/i);
    await assert.rejects(listTrips("user-token"), /invalid saved trips response/i);
    await assert.rejects(saveTrip({}, {}, "user-token"), /did not confirm that the trip was saved/i);
    await assert.rejects(getTrip("trip-1", "user-token"), /incomplete saved trip/i);
  } finally { globalThis.fetch = previousFetch; }
});

test("saved-trip requests carry the caller bearer token and URL-encode trip IDs", async () => {
  const previousFetch = globalThis.fetch;
  let requested;
  globalThis.fetch = async (url, options) => {
    requested = { url, options };
    return new Response(JSON.stringify({ id: "trip/one", itinerary: { result: { destination: "Jaipur", days: [] } } }), { status: 200 });
  };
  try {
    const row = await getTrip("trip/one", "user-token");
    assert.equal(row.id, "trip/one");
    assert.equal(requested.url, "/api/v1/trips/trip%2Fone");
    assert.equal(requested.options.headers.Authorization, "Bearer user-token");
  } finally { globalThis.fetch = previousFetch; }
});
