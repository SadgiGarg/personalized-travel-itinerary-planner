import { describe, expect, test } from "vitest";
import { nextDate, validateTripForm, withRecalculatedCosts } from "./tripForm.js";

const validTrip = {
  destination: "Jaipur", start_date: "2027-01-10", end_date: "2027-01-12", budget: "12000",
  currency: "INR", travelers: "2", interests: ["culture"], dietary_preferences: [], notes: "",
};

describe("trip form validation", () => {
  test("accepts a valid request and permits 31 inclusive days", () => {
    expect(validateTripForm(validTrip)).toBe("");
    expect(validateTripForm({ ...validTrip, end_date: "2027-02-09" })).toBe("");
  });

  test.each([
    [{ destination: " " }, /destination/i],
    [{ start_date: "2027-02-30" }, /valid/i],
    [{ end_date: "2027-01-09" }, /end date/i],
    [{ end_date: "2027-02-10" }, /31 calendar days/i],
    [{ budget: "0" }, /budget/i],
    [{ travelers: "1.5" }, /travellers/i],
    [{ interests: [] }, /interests/i],
  ])("rejects invalid form values %#", (override, message) => {
    expect(validateTripForm({ ...validTrip, ...override })).toMatch(message);
  });

  test("calculates inclusive end-date limits without local timezone drift", () => {
    expect(nextDate("2027-03-08", 30)).toBe("2027-04-07");
    expect(nextDate("", 30)).toBe("");
    expect(nextDate("2027-02-30", 30)).toBe("");
  });
});

test("recalculates day and trip totals, preserving unknown-cost semantics", () => {
  const itinerary = {
    budget: 100,
    estimated_total: 0,
    days: [
      { activities: [{ estimated_cost: 12.25 }], meals: [{ estimated_cost: 7.75 }] },
      { activities: [{ estimated_cost: 90 }], meals: [] },
    ],
  };
  const result = withRecalculatedCosts(itinerary);
  expect(result.days.map((day) => day.estimated_total)).toEqual([20, 90]);
  expect(result.estimated_total).toBe(110);
  expect(result.budget_remaining).toBe(-10);
  expect(result.budget_status).toBe("over_budget");
  expect(withRecalculatedCosts({ ...itinerary, days: [{ activities: [{ estimated_cost: null }], meals: [] }] }).estimated_total).toBeNull();
});
