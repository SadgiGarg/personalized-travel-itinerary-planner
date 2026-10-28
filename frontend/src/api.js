import { createClient } from "@supabase/supabase-js";

// Leave VITE_API_BASE_URL blank locally: relative /api requests go through Vite's
// proxy to FastAPI at http://127.0.0.1:8000. For separate production hosting,
// set it to the actual Render service URL so requests do not go to the Vercel origin.
const env = import.meta.env || {};
const API_BASE = (env.VITE_API_BASE_URL || "").trim().replace(/\/+$/, "");
const SUPABASE_URL = (env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const SUPABASE_REDIRECT_URL = env.VITE_SUPABASE_REDIRECT_URL || "";
export const accountConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);
export const supabase = accountConfigured ? createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null;

function requireSupabase() {
  if (!supabase) throw new Error("Supabase Auth is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in frontend/.env.local, then restart Vite.");
  return supabase;
}

async function api(path, { token, ...options } = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
    });
  } catch (error) {
    if (error instanceof TypeError) throw new Error("Could not reach the planner API. Start the backend at http://127.0.0.1:8000 or set VITE_API_BASE_URL.");
    throw error;
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch { /* Proxy/server may return plain text or HTML. */ }
    const detail = Array.isArray(body.detail) ? body.detail.map((item) => item.msg).join("; ") : body.detail;
    const serverMessage = typeof body.message === "string" ? body.message : typeof body.error === "string" ? body.error : "";
    const plainText = text && !/^\s*</.test(text) ? text.slice(0, 240) : "";
    const message = detail || serverMessage || plainText || (response.status >= 500
      ? `Planner API returned HTTP ${response.status}. Check that FastAPI is running and review its terminal logs.`
      : `Planner API returned HTTP ${response.status}. Check the request details and try again.`);
    throw new Error(message);
  }
  if (response.status === 204) return null;
  try { return await response.json(); }
  catch { throw new Error("Planner API returned an invalid JSON response. Check the backend version and logs."); }
}

function assertItinerary(result) {
  if (!result || typeof result !== "object" || typeof result.destination !== "string" || !Array.isArray(result.days)
    || result.days.some((day) => !day || typeof day !== "object" || !Array.isArray(day.activities) || !Array.isArray(day.meals))) {
    throw new Error("Planner API returned an invalid itinerary response. Check that the frontend and backend versions match.");
  }
  return result;
}

export function formatAuthErrorMessage(error, action = "auth") {
  const code = String(error?.code || error?.name || "").toLowerCase();
  const message = String(error?.message || "");
  const normalized = `${code} ${message}`.toLowerCase();
  if (/email rate limit exceeded|over_email_send_rate_limit/.test(normalized)) {
    return "Supabase has temporarily limited confirmation-email sending. Do not retry signup repeatedly. Wait for the limit to reset; if this account is waiting for verification, keep it and log in after confirming your email.";
  }
  if (/user[ _]already[ _](registered|exists)|already registered/.test(normalized)) {
    return "This email may already have an account. Try logging in instead of signing up again.";
  }
  if (/invalid login credentials|invalid_credentials/.test(normalized)) {
    return "Email or password is incorrect. Check both and try again. If you have not confirmed your email yet, open its confirmation link first.";
  }
  if (/email not confirmed|email_not_confirmed/.test(normalized)) {
    return "This account is waiting for email verification. Open the confirmation link from Supabase, then log in.";
  }
  if (message) return message;
  return action === "signup" ? "Supabase could not create the account. Please try again later." : "Supabase authentication failed. Please try again later.";
}

function authResult(result, action) {
  if (result.error) {
    const error = new Error(formatAuthErrorMessage(result.error, action));
    if (/email rate limit exceeded|over_email_send_rate_limit/i.test(`${result.error.code || ""} ${result.error.message || ""}`)) {
      error.code = "email_rate_limited";
    }
    throw error;
  }
  return result.data;
}
async function authRequest(request, action) {
  try {
    return authResult(await request(), action);
  } catch (error) {
    // Supabase Auth wraps browser fetch/CORS/network failures in this retryable error.
    if ((error?.name === "AuthRetryableFetchError" && error.status === 0) || error instanceof TypeError) {
      throw new Error("Could not reach Supabase Auth from this browser. This request goes directly to your Supabase project, not FastAPI. Check the request in DevTools → Network and Console for a blocked request, CORS, DNS, firewall, or connectivity error; also verify the Supabase project URL.");
    }
    if (error instanceof Error && error.message !== "") throw error;
    throw new Error(formatAuthErrorMessage(error, action));
  }
}
export const signIn = (email, password) => authRequest(() => requireSupabase().auth.signInWithPassword({ email, password }), "signin");
export const signUp = async (email, password) => {
  let emailRedirectTo = SUPABASE_REDIRECT_URL;
  if (!emailRedirectTo && typeof window !== "undefined") emailRedirectTo = new URL("/login?confirmed=1", window.location.origin).toString();
  return authRequest(() => requireSupabase().auth.signUp({ email, password, options: { ...(emailRedirectTo ? { emailRedirectTo } : {}) } }), "signup");
};
export const signOut = () => authRequest(() => requireSupabase().auth.signOut(), "signout");
export const generateItinerary = async (payload) => assertItinerary(await api("/api/v1/itineraries/generate", { method: "POST", body: JSON.stringify(payload) }));
export const regenerateDay = async (payload) => assertItinerary(await api("/api/v1/itineraries/regenerate-day", { method: "POST", body: JSON.stringify(payload) }));
export const saveTrip = async (trip, itinerary, token) => {
  const result = await api("/api/v1/trips", { method: "POST", body: JSON.stringify({ trip, itinerary }), token });
  if (!result || typeof result.id !== "string") throw new Error("Planner API did not confirm that the trip was saved.");
  return result;
};
export const listTrips = async (token) => {
  const result = await api("/api/v1/trips", { token });
  if (!Array.isArray(result) || result.some((trip) => !trip || typeof trip.id !== "string" || typeof trip.destination !== "string")) {
    throw new Error("Planner API returned an invalid saved trips response.");
  }
  return result;
};
export const getTrip = async (id, token) => {
  const result = await api(`/api/v1/trips/${encodeURIComponent(id)}`, { token });
  if (!result || typeof result.id !== "string" || !result.itinerary?.result) throw new Error("Planner API returned an incomplete saved trip.");
  assertItinerary(result.itinerary.result);
  return result;
};
export const updateTrip = async (id, trip, itinerary, token) => {
  const result = await api(`/api/v1/trips/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ trip, itinerary }), token });
  if (!result || typeof result.id !== "string") throw new Error("Planner API did not confirm that the trip was updated.");
  return result;
};
export const deleteTrip = (id, token) => api(`/api/v1/trips/${encodeURIComponent(id)}`, { method: "DELETE", token });
