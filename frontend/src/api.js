const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
export async function generateItinerary(payload) {
  const response = await fetch(`${API_BASE}/api/itineraries/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = Array.isArray(body.detail) ? body.detail.map((item) => item.msg).join("; ") : body.detail || "Could not generate itinerary. Check the inputs and try again.";
    throw new Error(message);
  }
  return response.json();
}
