export function payloadFrom(form) {
  return { ...form, budget: Number(form.budget), travelers: Number(form.travelers) };
}

export function validateTripForm(form) {
  const destination = String(form.destination || "").trim();
  if (destination.length < 2 || destination.length > 120) return "Enter a destination between 2 and 120 characters.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.start_date) || !/^\d{4}-\d{2}-\d{2}$/.test(form.end_date)) return "Choose a valid start and end date.";
  const start = Date.parse(`${form.start_date}T00:00:00Z`);
  const end = Date.parse(`${form.end_date}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)
    || new Date(start).toISOString().slice(0, 10) !== form.start_date
    || new Date(end).toISOString().slice(0, 10) !== form.end_date) return "Choose valid trip dates.";
  if (end < start) return "The end date must be on or after the start date.";
  if ((end - start) / 86_400_000 > 30) return "Trips can be at most 31 calendar days.";
  const budget = Number(form.budget);
  if (!Number.isFinite(budget) || budget <= 0 || budget > 10_000_000) return "Enter a budget greater than 0 and no more than 10,000,000.";
  const travelers = Number(form.travelers);
  if (!Number.isInteger(travelers) || travelers < 1 || travelers > 30) return "Enter between 1 and 30 travellers.";
  if (!Array.isArray(form.interests) || form.interests.length < 1 || form.interests.length > 12) return "Choose between 1 and 12 interests.";
  if (form.interests.some((value) => !String(value).trim() || String(value).length > 60)) return "Each interest must contain 1 to 60 characters.";
  if (!Array.isArray(form.dietary_preferences) || form.dietary_preferences.length > 8) return "Choose no more than 8 food preferences.";
  if (String(form.notes || "").length > 1000) return "Notes must be no more than 1,000 characters.";
  if (!/^[A-Z]{3}$/.test(form.currency || "")) return "Choose a valid three-letter currency code.";
  return "";
}

export function withRecalculatedCosts(value) {
  const days = value.days.map((day) => {
    const costs = [...day.activities.map((item) => item.estimated_cost), ...day.meals.map((item) => item.estimated_cost)];
    return { ...day, estimated_total: costs.every((cost) => cost != null) ? Number(costs.reduce((sum, cost) => sum + cost, 0).toFixed(2)) : null };
  });
  const costs = days.flatMap((day) => [...day.activities.map((item) => item.estimated_cost), ...day.meals.map((item) => item.estimated_cost)]);
  const total = costs.every((cost) => cost != null) ? Number(costs.reduce((sum, cost) => sum + cost, 0).toFixed(2)) : null;
  return { ...value, days, estimated_total: total, budget_remaining: total == null ? null : Number((value.budget - total).toFixed(2)),
    budget_status: total == null ? "unknown" : total > value.budget ? "over_budget" : "within_budget" };
}

export function nextDate(value, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return "";
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
