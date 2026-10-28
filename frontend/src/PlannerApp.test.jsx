import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const mocks = vi.hoisted(() => {
  const state = {
    authListener: null,
    generateItinerary: vi.fn(), regenerateDay: vi.fn(),
    signIn: vi.fn(), signUp: vi.fn(), signOut: vi.fn(),
    saveTrip: vi.fn(), updateTrip: vi.fn(), listTrips: vi.fn(), getTrip: vi.fn(), deleteTrip: vi.fn(),
    getSession: vi.fn(),
  };
  state.supabase = { auth: {
    onAuthStateChange: vi.fn((listener) => {
      state.authListener = listener;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    getSession: state.getSession,
  } };
  return state;
});

vi.mock("./api.js", () => ({
  accountConfigured: true,
  supabase: mocks.supabase,
  generateItinerary: mocks.generateItinerary,
  regenerateDay: mocks.regenerateDay,
  signIn: mocks.signIn,
  signUp: mocks.signUp,
  signOut: mocks.signOut,
  saveTrip: mocks.saveTrip,
  updateTrip: mocks.updateTrip,
  listTrips: mocks.listTrips,
  getTrip: mocks.getTrip,
  deleteTrip: mocks.deleteTrip,
}));

import PlannerApp from "./PlannerApp.jsx";
import { nextDate } from "./tripForm.js";

const userSession = { access_token: "test-user-token", user: { id: "user-1", email: "traveller@example.test" } };

function makeItinerary(trip, secondDayTitle = "Museum visit") {
  const count = (Date.parse(`${trip.end_date}T00:00:00Z`) - Date.parse(`${trip.start_date}T00:00:00Z`)) / 86_400_000 + 1;
  const days = Array.from({ length: count }, (_, index) => {
    const cost = index === 0 ? 50 : 60;
    return {
      day: index + 1,
      date: nextDate(trip.start_date, index),
      title: `Day ${index + 1}`,
      summary: "An easy day.",
      activities: [{ id: `activity-${index + 1}`, time: "10:00", title: index === 1 ? secondDayTitle : "City walk", description: "A sample activity.", category: "culture", estimated_cost: cost, currency: trip.currency }],
      meals: [{ meal: "Lunch", name: "Local cafe", notes: "", estimated_cost: 50, currency: trip.currency }],
      transport_note: "Check local transport.", estimated_total: cost + 50, currency: trip.currency,
    };
  });
  const total = days.reduce((sum, day) => sum + day.estimated_total, 0);
  return {
    destination: trip.destination, start_date: trip.start_date, end_date: trip.end_date, currency: trip.currency,
    budget: trip.budget, travelers: trip.travelers, estimated_total: total, budget_remaining: trip.budget - total,
    budget_status: total > trip.budget ? "over_budget" : "within_budget", summary: "A test itinerary.",
    provider: "demo mock", disclaimer: "Illustrative estimates.", days,
  };
}

function makeSavedRow(id, trip, itinerary) {
  return {
    id, title: `${trip.destination} · ${trip.start_date}`, destination: trip.destination,
    start_date: trip.start_date, end_date: trip.end_date, currency: trip.currency, budget: trip.budget,
    itinerary: { trip, result: itinerary },
  };
}

function renderAt(path) {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/" element={<PlannerApp page="home" />} />
    <Route path="/plan-trip" element={<PlannerApp page="plan-trip" />} />
    <Route path="/login" element={<PlannerApp page="login" />} />
    <Route path="/signup" element={<PlannerApp page="signup" />} />
    <Route path="/saved-trips" element={<PlannerApp page="saved-trips" />} />
    <Route path="/itinerary/:id" element={<PlannerApp page="itinerary" />} />
  </Routes></MemoryRouter>);
}

beforeEach(() => {
  sessionStorage.clear();
  window.scrollTo = vi.fn();
  window.confirm = vi.fn(() => true);
  mocks.authListener = null;
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
  mocks.generateItinerary.mockImplementation(async (trip) => makeItinerary(trip));
  mocks.regenerateDay.mockImplementation(async ({ itinerary }) => ({
    ...itinerary,
    days: itinerary.days.map((day) => day.day === 2 ? { ...day, activities: [{ ...day.activities[0], title: "Regenerated stop" }] } : day),
  }));
  mocks.signIn.mockImplementation(async () => {
    mocks.authListener?.("SIGNED_IN", userSession);
    return { session: userSession };
  });
  mocks.signUp.mockImplementation(async () => ({ session: null }));
  mocks.signOut.mockImplementation(async () => { mocks.authListener?.("SIGNED_OUT", null); return {}; });
  mocks.saveTrip.mockImplementation(async (trip, itinerary) => makeSavedRow("saved-1", trip, itinerary));
  mocks.updateTrip.mockImplementation(async (id, trip, itinerary) => makeSavedRow(id, trip, itinerary));
  mocks.listTrips.mockResolvedValue([]);
  mocks.getTrip.mockImplementation(async (id) => makeSavedRow(id, {
    destination: "Jaipur", start_date: "2027-01-10", end_date: "2027-01-11", budget: 1000,
    currency: "INR", travelers: 2, traveler_type: "couple", travel_style: "balanced",
    interests: ["culture"], dietary_preferences: [], notes: "",
  }, makeItinerary({ destination: "Jaipur", start_date: "2027-01-10", end_date: "2027-01-11", budget: 1000, currency: "INR", travelers: 2 })));
  mocks.deleteTrip.mockResolvedValue(null);
  mocks.signIn.mockClear(); mocks.signUp.mockClear(); mocks.signOut.mockClear();
  mocks.generateItinerary.mockClear(); mocks.regenerateDay.mockClear();
  mocks.saveTrip.mockClear(); mocks.updateTrip.mockClear(); mocks.getTrip.mockClear(); mocks.deleteTrip.mockClear();
  mocks.listTrips.mockClear(); mocks.getSession.mockClear(); mocks.supabase.auth.onAuthStateChange.mockClear();
});
afterEach(cleanup);

async function createTrip(user, { destination = "Jaipur", budget = "1000" } = {}) {
  await user.type(screen.getByLabelText("Destination"), destination);
  fireEvent.change(screen.getByLabelText("Total trip budget (INR)"), { target: { value: budget } });
  await user.click(screen.getByRole("button", { name: "Build my itinerary" }));
  await screen.findByRole("heading", { name: `Your ${destination} escape` });
}

describe("itinerary journeys", () => {
  test("submits the latest destination, dates, group, interests, pace, food, and notes", async () => {
    const user = userEvent.setup();
    renderAt("/plan-trip");
    await user.type(screen.getByLabelText("Destination"), "Jaipur");
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2027-07-01" } });
    expect(screen.getByLabelText("End date").value).toBe("2027-07-01");
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2027-07-03" } });
    fireEvent.change(screen.getByLabelText("Total trip budget (INR)"), { target: { value: "1800" } });
    fireEvent.change(screen.getByLabelText("Trip type"), { target: { value: "solo" } });
    expect(screen.getByLabelText("Travellers").value).toBe("1");
    fireEvent.change(screen.getByLabelText("Travel pace"), { target: { value: "relaxed" } });
    await user.click(screen.getByRole("button", { name: "nature" }));
    await user.click(screen.getByRole("button", { name: "food" }));
    fireEvent.change(screen.getByLabelText("Food preference"), { target: { value: "vegan" } });
    await user.type(screen.getByLabelText(/Accessibility and other notes/), "Step-free access");
    await user.click(screen.getByRole("button", { name: "Build my itinerary" }));

    await screen.findByRole("heading", { name: "Your Jaipur escape" });
    expect(mocks.generateItinerary).toHaveBeenCalledTimes(1);
    expect(mocks.generateItinerary.mock.calls[0][0]).toMatchObject({
      destination: "Jaipur", start_date: "2027-07-01", end_date: "2027-07-03",
      budget: 1800, travelers: 1, traveler_type: "solo", travel_style: "relaxed",
      interests: expect.arrayContaining(["culture", "nature"]), dietary_preferences: ["vegan"], notes: "Step-free access",
    });
    expect(screen.getByText("DAY 03")).toBeTruthy();
  });

  test("edits activity details, validates empty fields, and recalculates the over-budget summary", async () => {
    const user = userEvent.setup();
    renderAt("/plan-trip");
    await createTrip(user, { budget: "200" });
    await user.click(screen.getAllByRole("button", { name: "Edit activity" })[0]);
    await user.clear(screen.getByLabelText("Activity name"));
    await user.click(screen.getByRole("button", { name: "Apply edit" }));
    expect(screen.getByRole("alert").textContent).toMatch(/activity name/i);
    expect(screen.getAllByText("City walk")).toHaveLength(1);

    await user.type(screen.getByLabelText("Activity name"), "  Fort visit  ");
    await user.clear(screen.getByLabelText("Estimated cost"));
    await user.type(screen.getByLabelText("Estimated cost"), "300.25");
    await user.click(screen.getByRole("button", { name: "Apply edit" }));
    expect(screen.getByText("Fort visit")).toBeTruthy();
    expect(screen.getByText(/over$/)).toBeTruthy();
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
  });

  test("day regeneration keeps the original trip contract after form edits; whole regeneration uses the edited form", async () => {
    const user = userEvent.setup();
    renderAt("/plan-trip");
    await createTrip(user);
    await user.click(screen.getByRole("link", { name: "Plan a Trip" }));
    const destination = screen.getByLabelText("Destination");
    await user.clear(destination);
    await user.type(destination, "Goa");
    await user.click(screen.getByRole("link", { name: "Itinerary Details" }));

    await user.click(screen.getByRole("button", { name: "Regenerate day 2" }));
    await waitFor(() => expect(mocks.regenerateDay).toHaveBeenCalledTimes(1));
    expect(mocks.regenerateDay.mock.calls[0][0].trip.destination).toBe("Jaipur");
    expect(screen.getAllByText("City walk")).toHaveLength(2);
    expect(screen.getByText("Regenerated stop")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Regenerate itinerary" }));
    await waitFor(() => expect(mocks.generateItinerary).toHaveBeenCalledTimes(2));
    expect(mocks.generateItinerary.mock.calls[1][0].destination).toBe("Goa");
    await screen.findByRole("heading", { name: "Your Goa escape" });
  });

  test("reports generation failures and disables duplicate submissions while loading", async () => {
    const user = userEvent.setup();
    let rejectGeneration;
    mocks.generateItinerary.mockImplementationOnce(() => new Promise((_, reject) => { rejectGeneration = reject; }));
    renderAt("/plan-trip");
    await user.type(screen.getByLabelText("Destination"), "Jaipur");
    await user.click(screen.getByRole("button", { name: "Build my itinerary" }));
    expect(screen.getByRole("button", { name: /Planning/ }).disabled).toBe(true);
    rejectGeneration(new Error("API unavailable"));
    expect((await screen.findByRole("alert")).textContent).toContain("API unavailable");
    expect(screen.getByRole("button", { name: "Build my itinerary" }).disabled).toBe(false);
  });

  test("persists a generated demo itinerary for the current browser session", async () => {
    const user = userEvent.setup();
    renderAt("/plan-trip");
    await createTrip(user);
    expect(JSON.parse(sessionStorage.getItem("travel-planner-draft")).trip.destination).toBe("Jaipur");
    cleanup();
    renderAt("/itinerary/current");
    expect(await screen.findByRole("heading", { name: "Your Jaipur escape" })).toBeTruthy();
    expect(screen.getAllByRole("article")).toHaveLength(3);
  });
});

describe("account-backed journeys with an isolated API test double", () => {
  test("logs in and waits for the saved trips response", async () => {
    const user = userEvent.setup();
    mocks.listTrips.mockResolvedValue([]);
    renderAt("/login");
    await user.type(screen.getByLabelText("Email"), "traveller@example.test");
    await user.type(screen.getByLabelText("Password"), "test-password");
    await user.click(screen.getByRole("button", { name: "Log in" }));
    expect(mocks.signIn).toHaveBeenCalledWith("traveller@example.test", "test-password");
    expect(await screen.findByText(/No saved trips yet/)).toBeTruthy();
    expect(mocks.listTrips).toHaveBeenCalledWith("test-user-token");
  });

  test("shows the confirmation step after signup when email confirmation leaves no session", async () => {
    const user = userEvent.setup();
    renderAt("/signup");
    await user.type(screen.getByLabelText("Email"), "new@example.test");
    await user.type(screen.getByLabelText("Password"), "test-password");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(mocks.signUp).toHaveBeenCalledWith("new@example.test", "test-password");
    expect(await screen.findByText(/confirmation link/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirmation pending" }).disabled).toBe(true);
    await user.click(screen.getByRole("link", { name: "Log in" }));
    expect(mocks.signUp).toHaveBeenCalledTimes(1);
  });

  test("locks signup after Supabase reports its email delivery limit", async () => {
    const user = userEvent.setup();
    const rateLimit = new Error("Supabase has temporarily limited confirmation-email sending. Do not retry signup repeatedly.");
    rateLimit.code = "email_rate_limited";
    mocks.signUp.mockRejectedValue(rateLimit);
    renderAt("/signup");
    await user.type(screen.getByLabelText("Email"), "new@example.test");
    await user.type(screen.getByLabelText("Password"), "test-password");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText(/Do not retry signup repeatedly/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Email limit reached" }).disabled).toBe(true);
    expect(mocks.signUp).toHaveBeenCalledTimes(1);
  });

  test("explains expired confirmation links on the login callback", async () => {
    renderAt("/login?error=access_denied&error_code=otp_expired");
    expect(await screen.findByText(/confirmation link has expired or was already used/i)).toBeTruthy();
  });

  test("does not restore a stale session after a newer auth event", async () => {
    let resolveSession;
    mocks.getSession.mockReturnValue(new Promise((resolve) => { resolveSession = resolve; }));
    renderAt("/saved-trips");
    await waitFor(() => expect(mocks.authListener).toBeTypeOf("function"));
    await act(async () => { mocks.authListener("SIGNED_OUT", null); });
    resolveSession({ data: { session: userSession }, error: null });
    expect(await screen.findByText(/Log in to see and manage trips/)).toBeTruthy();
    expect(mocks.listTrips).not.toHaveBeenCalled();
  });

  test("saves, reopens, updates, and deletes a trip through the API boundary", async () => {
    const user = userEvent.setup();
    mocks.getSession.mockResolvedValue({ data: { session: userSession }, error: null });
    const savedTrip = {
      destination: "Jaipur", start_date: "2027-01-10", end_date: "2027-01-11", budget: 1000,
      currency: "INR", travelers: 2, traveler_type: "couple", travel_style: "balanced",
      interests: ["culture", "food"], dietary_preferences: ["vegetarian"], notes: "",
    };
    const row = makeSavedRow("saved-1", savedTrip, makeItinerary(savedTrip));
    mocks.saveTrip.mockResolvedValue(row);
    mocks.getTrip.mockResolvedValue(row);
    mocks.listTrips.mockResolvedValue([row]);
    renderAt("/plan-trip");
    await createTrip(user);
    await screen.findByRole("button", { name: "Save trip" });
    await user.click(screen.getByRole("button", { name: "Save trip" }));
    await waitFor(() => expect(mocks.saveTrip).toHaveBeenCalledTimes(1));
    await screen.findByRole("heading", { name: "Your Jaipur escape" });
    expect(mocks.saveTrip.mock.calls[0][2]).toBe("test-user-token");
    await waitFor(() => expect(mocks.getTrip).toHaveBeenCalledTimes(1));

    const getCountBeforeOpen = mocks.getTrip.mock.calls.length;
    await user.click(screen.getByRole("link", { name: "Saved Trips" }));
    await screen.findByRole("heading", { name: "Jaipur" });
    await user.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByRole("heading", { name: "Your Jaipur escape" });
    expect(mocks.getTrip).toHaveBeenCalledTimes(getCountBeforeOpen + 1);
    expect(mocks.getTrip).toHaveBeenLastCalledWith("saved-1", "test-user-token");

    await user.click(screen.getAllByRole("button", { name: "Edit activity" })[0]);
    await user.clear(screen.getByLabelText("Activity name"));
    await user.type(screen.getByLabelText("Activity name"), "Updated activity");
    await user.click(screen.getByRole("button", { name: "Apply edit" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.updateTrip).toHaveBeenCalledTimes(1));
    expect(mocks.updateTrip.mock.calls[0][0]).toBe("saved-1");

    mocks.listTrips.mockResolvedValueOnce([]);
    await user.click(screen.getByRole("link", { name: "Saved Trips" }));
    await screen.findByRole("heading", { name: "Jaipur" });
    await user.click(screen.getByRole("button", { name: "Delete Jaipur trip" }));
    await waitFor(() => expect(mocks.deleteTrip).toHaveBeenCalledWith("saved-1", "test-user-token"));
    expect(await screen.findByText(/No saved trips yet/)).toBeTruthy();
  });

  test("sign out clears the local trip draft so another browser user cannot reopen it", async () => {
    const user = userEvent.setup();
    mocks.getSession.mockResolvedValue({ data: { session: userSession }, error: null });
    const privateTrip = { destination: "Private destination", start_date: "2027-01-10", end_date: "2027-01-10", budget: 100, currency: "INR", travelers: 1 };
    sessionStorage.setItem("travel-planner-draft", JSON.stringify({ trip: privateTrip, itinerary: makeItinerary(privateTrip) }));
    renderAt("/");
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(sessionStorage.getItem("travel-planner-draft")).toBeNull());
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Private destination")).toBeNull();
  });
});
