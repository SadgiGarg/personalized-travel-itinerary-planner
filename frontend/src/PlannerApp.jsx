import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Bookmark, CalendarDays, CheckCircle2, Clock3, Compass, LoaderCircle, MapPin, Menu, RefreshCw, Save, Trash2, Utensils, Wallet, Users, X } from "lucide-react";
import { accountConfigured, deleteTrip, generateItinerary, getTrip, listTrips, regenerateDay, saveTrip, signIn, signOut, signUp, supabase, updateTrip } from "./api.js";
import { nextDate, payloadFrom, validateTripForm, withRecalculatedCosts } from "./tripForm.js";

const today = new Date();
const isoDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const start = new Date(today); start.setDate(start.getDate() + 14);
const end = new Date(start); end.setDate(end.getDate() + 2);
const initial = { destination: "", start_date: isoDate(start), end_date: isoDate(end), budget: "15000", currency: "INR", travelers: "2", traveler_type: "couple", travel_style: "balanced", interests: ["culture", "food"], dietary_preferences: ["vegetarian"], notes: "" };
const interestOptions = ["culture", "food", "nature", "adventure", "history", "shopping", "photography", "nightlife"];
const money = (value, currency = "INR") => value == null ? "Cost unknown" : new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
const displayDate = (value) => new Date(`${value}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", weekday: "short" });
function readDraft() {
  try { return JSON.parse(sessionStorage.getItem("travel-planner-draft") || "null"); }
  catch { return null; }
}
function writeDraft(trip, itinerary) {
  try { sessionStorage.setItem("travel-planner-draft", JSON.stringify({ trip, itinerary })); return true; }
  catch { return false; }
}
function clearDraft() {
  try { sessionStorage.removeItem("travel-planner-draft"); }
  catch { /* Session storage can be disabled by browser policy. */ }
}

export default function PlannerApp({ page }) {
  const routerNavigate = useNavigate();
  const location = useLocation();
  const { id: routeId } = useParams();
  const [menuOpen, setMenuOpen] = useState(false);
  function navigate(path) {
    routerNavigate(path);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  const [form, setForm] = useState(() => {
    const request = readDraft()?.trip;
    return request ? { ...initial, ...request, budget: String(request.budget), travelers: String(request.travelers) } : initial;
  });
  const [tripRequest, setTripRequest] = useState(() => readDraft()?.trip || null);
  const [itinerary, setItinerary] = useState(() => {
    if (page === "itinerary" && routeId && routeId !== "current") return null;
    return readDraft()?.itinerary || null;
  });
  const [tripId, setTripId] = useState(null);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(Boolean(supabase));
  const [savedTrips, setSavedTrips] = useState([]);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signupLocked, setSignupLocked] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(null);
  const [editDraft, setEditDraft] = useState({});
  const [dirty, setDirty] = useState(false);
  const [editError, setEditError] = useState("");
  const previousUserId = useRef(null);
  const dayCount = useMemo(() => itinerary?.days?.length || 0, [itinerary]);

  function clearUserTripState() {
    setTripId(null); setItinerary(null); setTripRequest(null); setForm(initial);
    setDirty(false); setEditing(null); setEditError(""); clearDraft();
  }

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    let authEventReceived = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) { authEventReceived = true; setSession(nextSession); setAuthLoading(false); }
    });
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) setError(`Could not restore your Supabase session: ${sessionError.message}`);
      else if (!authEventReceived) setSession(data.session);
    }).catch((sessionError) => {
      if (active) setError(`Could not restore your Supabase session: ${sessionError.message || "Please reload and try again."}`);
    }).finally(() => { if (active) setAuthLoading(false); });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    const userId = session?.user?.id || null;
    if (previousUserId.current && previousUserId.current !== userId) clearUserTripState();
    previousUserId.current = userId;
  }, [session?.user?.id]);

  useEffect(() => {
    if (page !== "login") return;
    const params = new URLSearchParams(location.search);
    if (params.get("confirmed") === "1") {
      setError("");
      setNotice("Email confirmed. You can now log in.");
    } else if (params.has("error_code") || params.has("error")) {
      const code = params.get("error_code") || "";
      setNotice("");
      setError(code === "otp_expired"
        ? "This confirmation link has expired or was already used. Try logging in; if your email is still unconfirmed, wait until email sending is available before requesting another link."
        : "Supabase could not confirm this email link. It may have expired or already been used. Try logging in, and do not repeatedly request new emails.");
    }
  }, [page, location.search]);

  useEffect(() => {
    if (!session?.access_token) { setSavedTrips([]); setTripsLoading(false); return; }
    let active = true;
    setTripsLoading(true); setError("");
    listTrips(session.access_token).then((trips) => { if (active) setSavedTrips(trips); }).catch((err) => { if (active) setError(err.message); }).finally(() => { if (active) setTripsLoading(false); });
    return () => { active = false; };
  }, [session]);

  useEffect(() => {
    if (page !== "itinerary" || !routeId || routeId === "current") return;
    setItinerary(null); setTripRequest(null); setTripId(routeId); setError("");
  }, [page, routeId]);

  useEffect(() => {
    if (page !== "itinerary" || !routeId || routeId === "current" || !session?.access_token) return;
    let active = true;
    setBusy("open-route"); setError("");
    getTrip(routeId, session.access_token).then((row) => {
      if (!active) return;
      setTripId(row.id);
      const request = row.itinerary?.trip;
      const savedItinerary = row.itinerary?.result || null;
      const preferences = request || (savedItinerary ? {
        ...initial, destination: savedItinerary.destination, start_date: savedItinerary.start_date,
        end_date: savedItinerary.end_date, currency: savedItinerary.currency,
        budget: savedItinerary.budget, travelers: savedItinerary.travelers,
      } : null);
      if (preferences) { setTripRequest(preferences); setForm({ ...initial, ...preferences, budget: String(preferences.budget), travelers: String(preferences.travelers) }); }
      setItinerary(savedItinerary); setDirty(false);
    }).catch((err) => { if (active) setError(err.message); }).finally(() => { if (active) setBusy(""); });
    return () => { active = false; };
  }, [page, routeId, session]);

  useEffect(() => {
    if (!itinerary) {
      if (page === "itinerary" && routeId && routeId !== "current") return;
      clearDraft(); return;
    }
    if (tripRequest && !tripId) writeDraft(tripRequest, itinerary);
    else clearDraft();
  }, [itinerary, tripRequest, tripId, page, routeId]);

  function setFormValue(event) {
    const { name, value } = event.target;
    setForm((current) => {
      const next = { ...current, [name]: value };
      if (name === "start_date" && next.end_date < value) next.end_date = value;
      if (name === "traveler_type" && value === "solo") next.travelers = "1";
      if (name === "traveler_type" && value === "couple") next.travelers = "2";
      return next;
    });
  }
  function toggleInterest(item) {
    setForm((current) => ({ ...current, interests: current.interests.includes(item) ? current.interests.filter((value) => value !== item) : [...current.interests, item] }));
  }
  async function run(action, callback) {
    setBusy(action); setError(""); setNotice("");
    try { await callback(); } catch (err) {
      if (action === "account" && page === "signup" && err?.code === "email_rate_limited") setSignupLocked(true);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
    finally { setBusy(""); }
  }
  async function generate() {
    const validationError = validateTripForm(form);
    if (validationError) { setError(validationError); return; }
    await run("generate", async () => {
      const request = payloadFrom(form);
      const result = await generateItinerary(request);
      setItinerary(result); setTripRequest(request); setTripId(null); setDirty(false); setEditing(null); setEditError("");
      if (!writeDraft(request, result)) setNotice("Your itinerary is ready, but browser storage is unavailable; it will not be restored after this tab closes.");
      navigate("/itinerary/current");
    });
  }
  async function regenerateWhole() {
    if (!window.confirm("Replace the full itinerary? Any edits you have not saved will be lost.")) return;
    await generate();
  }
  async function regenerateOne(dayNumber) {
    if (dirty && !window.confirm(`Regenerate day ${dayNumber}? Unsaved edits to that day may be replaced; other days will be preserved.`)) return;
    await run(`day-${dayNumber}`, async () => {
      const result = await regenerateDay({ trip: tripRequest || payloadFrom(form), itinerary, day_number: dayNumber });
      setItinerary(result); setDirty(true); setNotice(`Day ${dayNumber} regenerated. Save to keep this change.`);
    });
  }
  async function submitAccount(event, mode) {
    event.preventDefault();
    await run("account", async () => {
      const result = mode === "signup" ? await signUp(email, password) : await signIn(email, password);
      if (!result.session) {
        if (mode !== "signup") throw new Error("Supabase did not return a session. Check your email confirmation status and try again.");
        setPassword("");
        setSignupLocked(true);
        const mayAlreadyExist = Array.isArray(result.user?.identities) && result.user.identities.length === 0;
        setNotice(mayAlreadyExist
          ? "This email may already have an account. Try logging in. Otherwise, check your inbox and spam folder for a confirmation link. Do not submit signup again."
          : "Signup request received. Check your inbox and spam folder for a confirmation link, then log in. Do not submit signup again; email delivery is rate-limited.");
        return;
      }
      setPassword(""); setNotice(mode === "signup" ? "Account created and signed in." : "Signed in."); navigate("/saved-trips");
    });
  }
  async function logout() {
    await run("logout", async () => { await signOut(); setSession(null); clearUserTripState(); setNotice("Signed out."); navigate("/"); });
  }
  async function saveCurrent() {
    if (!session?.access_token || !itinerary) return;
    await run("save", async () => {
      const request = tripRequest || payloadFrom(form);
      if (tripId) await updateTrip(tripId, request, itinerary, session.access_token);
      else { const row = await saveTrip(request, itinerary, session.access_token); setTripId(row.id); navigate(`/itinerary/${row.id}`); }
      setDirty(false);
      try { setSavedTrips(await listTrips(session.access_token)); setNotice("Trip saved to your account."); }
      catch (err) { setError(`Trip was saved, but the saved trips list could not refresh: ${err.message}`); }
    });
  }
  async function openTrip(id) {
    if (dirty && !window.confirm("Open another trip and discard the current unsaved itinerary changes?")) return;
    setError(""); setNotice(""); navigate(`/itinerary/${id}`);
  }
  async function removeTrip(row) {
    if (!window.confirm(`Delete the saved trip to ${row.destination}?${dirty && tripId === row.id ? " Its unsaved changes will also be discarded." : ""} This cannot be undone.`)) return;
    await run(`delete-${row.id}`, async () => {
      await deleteTrip(row.id, session.access_token);
      setSavedTrips((current) => current.filter((trip) => trip.id !== row.id));
      if (tripId === row.id) clearUserTripState();
      setNotice("Saved trip deleted.");
      try { setSavedTrips(await listTrips(session.access_token)); }
      catch (err) { setError(`Trip was deleted, but the saved trips list could not refresh: ${err.message}`); }
    });
  }
  function startEdit(dayNumber, index, activity) {
    const key = `${dayNumber}:${index}`; setEditing(key); setEditError(""); setEditDraft({ title: activity.title, description: activity.description, estimated_cost: activity.estimated_cost ?? "" });
  }
  function applyEdit(dayNumber, index) {
    const title = String(editDraft.title || "").trim();
    const description = String(editDraft.description || "").trim();
    const cost = editDraft.estimated_cost === "" ? null : Number(editDraft.estimated_cost);
    if (!title || title.length > 140) { setEditError("Activity name must contain 1 to 140 characters."); return; }
    if (!description || description.length > 600) { setEditError("Description must contain 1 to 600 characters."); return; }
    if (cost !== null && (!Number.isFinite(cost) || cost < 0)) { setEditError("Estimated cost must be a non-negative number or left blank."); return; }
    setItinerary((current) => withRecalculatedCosts({ ...current, days: current.days.map((day) => day.day !== dayNumber ? day : { ...day, activities: day.activities.map((activity, at) => at !== index ? activity : { ...activity, title, description, estimated_cost: cost }) }) }));
    setEditing(null); setEditError(""); setDirty(true); setNotice("Activity updated. Save to keep this change.");
  }

  const navLink = (path, label, active) => <a className={active ? "nav-active" : ""} href={path} aria-current={active ? "page" : undefined} onClick={(event) => { event.preventDefault(); setMenuOpen(false); navigate(path); }}>{label}</a>;
  return <div className={`shell planner-shell page-${page}`}>
    <header className="topbar"><a className="brand" href="/" onClick={(event) => { event.preventDefault(); navigate("/"); }}><span className="brand-icon"><Compass size={20} /></span>wayfarer<span className="coral">.</span></a><button className="menu-toggle" type="button" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button><nav className={menuOpen ? "mobile-open" : ""} aria-label="Main navigation">{navLink("/", "Home", page === "home")}{navLink("/plan-trip", "Plan a Trip", page === "plan-trip")}{navLink(itinerary ? `/itinerary/${tripId || "current"}` : "/itinerary/current", "Itinerary Details", page === "itinerary")}{navLink("/saved-trips", "Saved Trips", page === "saved-trips")}{!session ? <>{navLink("/login", "Log in", page === "login")}{navLink("/signup", "Sign up", page === "signup")}</> : <button className="nav-button" type="button" disabled={Boolean(busy)} onClick={() => { setMenuOpen(false); logout(); }}>{busy === "logout" ? "Signing out…" : "Sign out"}</button>}</nav><span className="top-note"><i /> Your next adventure awaits</span></header>
    <main id="top">
      {page === "home" && <section className="hero"><div className="hero-copy"><div className="eyebrow"><Compass size={14} /> TRAVEL, THOUGHTFULLY</div><h1>Less planning.<br /><em>More living.</em></h1><p>Share what you enjoy, your travel dates, and budget. Get a flexible, day-by-day plan to make your own.</p><div className="hero-points"><span><CheckCircle2 size={15} /> Your pace, your way</span><span><CheckCircle2 size={15} /> Budget estimates</span></div><button className="primary home-cta" type="button" onClick={() => navigate("/plan-trip")}>Plan a trip <ArrowRight size={17} /></button></div><div className="hero-art"><img className="hero-photo" src="/travel-hero.svg" alt="Mountain lake and village at sunrise" /><div className="art-card"><MapPin size={19} /><div><strong>Your next adventure</strong><small>Start with a destination.</small></div></div></div></section>}
      {(page === "plan-trip" || page === "itinerary") && <section className="layout" id="planner">
        {page === "plan-trip" && <aside className="form-panel">{error && <div className="error" role="alert">{error}</div>}<div className="kicker">01 / YOUR JOURNEY</div><h2>Design your escape</h2><p className="muted">A few details help personalize your suggestions.</p>
          <form onSubmit={(event) => { event.preventDefault(); generate(); }}>
            <label htmlFor="destination">Destination</label><div className="input-wrap"><MapPin size={16} /><input id="destination" name="destination" value={form.destination} onChange={setFormValue} minLength="2" maxLength="120" placeholder="e.g. Jaipur, India" autoComplete="off" required /></div>
            <div className="two-col"><div><label htmlFor="start_date">Start date</label><div className="input-wrap"><CalendarDays size={15} /><input id="start_date" name="start_date" type="date" value={form.start_date} onChange={setFormValue} required /></div></div><div><label htmlFor="end_date">End date</label><div className="input-wrap"><CalendarDays size={15} /><input id="end_date" name="end_date" type="date" min={form.start_date} max={nextDate(form.start_date, 30)} value={form.end_date} onChange={setFormValue} required /></div></div></div>
            <div className="two-col"><div><label htmlFor="budget">Total trip budget ({form.currency})</label><div className="input-wrap"><Wallet size={15} /><input id="budget" name="budget" type="number" min="1" max="10000000" value={form.budget} onChange={setFormValue} required /></div></div><div><label htmlFor="travelers">Travellers</label><div className="input-wrap"><Users size={15} /><input id="travelers" name="travelers" type="number" min="1" max="30" step="1" value={form.travelers} onChange={setFormValue} required /></div></div></div>
            <label htmlFor="traveler_type">Trip type</label><select id="traveler_type" name="traveler_type" value={form.traveler_type} onChange={setFormValue}>{["solo", "couple", "group", "family"].map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select>
            <label htmlFor="travel_style">Travel pace</label><select id="travel_style" name="travel_style" value={form.travel_style} onChange={setFormValue}><option value="relaxed">Relaxed</option><option value="balanced">Balanced</option><option value="packed">Packed</option></select>
            <label>Interests <small>Select at least one</small></label><div className="chips">{interestOptions.map((item) => <button type="button" key={item} aria-pressed={form.interests.includes(item)} className={form.interests.includes(item) ? "selected" : ""} onClick={() => toggleInterest(item)}>{item}</button>)}</div>
            <label htmlFor="dietary_preferences">Food preference</label><select id="dietary_preferences" value={form.dietary_preferences[0] || "any"} onChange={(event) => { setForm((current) => ({ ...current, dietary_preferences: event.target.value === "any" ? [] : [event.target.value] })); }}><option value="any">Any</option><option value="vegetarian">Vegetarian</option><option value="vegan">Vegan</option><option value="halal">Halal</option><option value="gluten-free">Gluten-free</option></select>
            <label htmlFor="notes">Accessibility and other notes <small>optional</small></label><textarea id="notes" name="notes" rows="3" maxLength="1000" value={form.notes} onChange={setFormValue} placeholder="Mobility needs, places to avoid, or extra preferences" />
            <button className="primary" type="submit" disabled={Boolean(busy)}>{busy === "generate" ? <><LoaderCircle className="spin" size={17} /> Planning…</> : <>Build my itinerary <ArrowRight size={17} /></>}</button>
          </form>
          <section className="account-panel"><div className="kicker">ACCOUNT & SYNC</div><h3>{session ? "Your account" : "Save trips to your account"}</h3>{session ? <button className="secondary" type="button" onClick={() => navigate("/saved-trips")}>View saved trips</button> : <div className="account-actions"><button className="secondary" type="button" onClick={() => navigate("/login")}>Log in</button><button className="text-button" type="button" onClick={() => navigate("/signup")}>Create account</button></div>}</section>
        </aside>}
        {page === "itinerary" && <section className="itinerary" id="itinerary"><div className="itinerary-heading"><div><div className="kicker">02 / THE GOOD PART</div><h2>{itinerary ? `Your ${itinerary.destination} escape` : "A trip that feels like you"}</h2><p className="muted">{itinerary ? `${displayDate(itinerary.start_date)} – ${displayDate(itinerary.end_date)} · ${dayCount} days · ${itinerary.travelers} traveller(s)` : "Your itinerary will appear here after you plan a trip."}</p></div></div>
          {error && <div className="error" role="alert">{error}</div>}{notice && <div className="notice" role="status">{notice}</div>}
          {!itinerary ? busy === "open-route" || (authLoading && routeId !== "current") ? <div className="empty-state" role="status">Loading your saved itinerary…</div> : routeId !== "current" && !session ? <div className="empty-state"><p className="muted">Sign in to open this saved itinerary.</p><button className="secondary" type="button" onClick={() => navigate("/login")}>Log in</button></div> : <div className="empty"><div className="postcard"><div className="post-sun" /><div className="post-hill" /><div className="post-hill second" /><span>GO<br />SOMEWHERE</span></div><div className="ready"><i /> READY WHEN YOU ARE</div><h3>Your next favorite memory<br />starts with a little idea.</h3><p>Choose your destination, set your pace, and build a plan you can adjust.</p></div> : <>
            <div className={`provider-banner ${itinerary.provider === "live" ? "live" : "demo"}`} role="status">{itinerary.provider === "live" ? "AI generated suggestions · cost estimates may be inaccurate" : "Demo recommendations and illustrative cost estimates · no AI key configured"}</div>
            <div className="summary"><div><small>ESTIMATED TOTAL</small><strong>{money(itinerary.estimated_total, itinerary.currency)}</strong></div><div><small>YOUR TOTAL BUDGET</small><strong>{money(itinerary.budget, itinerary.currency)}</strong></div><div><small>BUDGET STATUS</small><strong className={itinerary.budget_status === "over_budget" ? "over" : ""}>{itinerary.budget_status === "over_budget" ? `${money(Math.abs(itinerary.budget_remaining), itinerary.currency)} over` : itinerary.budget_status === "unknown" ? "Costs incomplete" : "Within budget"}</strong></div></div>
            {itinerary.budget_status === "over_budget" && <div className="error" role="status">Listed estimates are {money(Math.abs(itinerary.budget_remaining), itinerary.currency)} over budget. Lower the trip budget in the form and regenerate for a lower-cost suggestion.</div>}
            <p className="summary-text">{itinerary.summary}<br /><small>Trip total is based on listed activity and meal estimates. Lodging and transport costs are not included.</small></p>
            {itinerary.days.map((day) => <article className="day" key={day.day}><div className="day-head"><div><small>DAY {String(day.day).padStart(2, "0")}</small><h3>{day.title}</h3><p>{displayDate(day.date)}</p></div><strong>{money(day.estimated_total, day.currency)}</strong></div>{day.summary && <p className="day-summary">{day.summary}</p>}
              <div className="timeline">{day.activities.map((activity, index) => {
                const key = `${day.day}:${index}`;
                return <div className="timeline-item" key={activity.id || key}>
                  <span className="timeline-icon"><MapPin size={14} /></span>
                  <div className="activity-content">{editing === key ? <div className="edit-activity">
                    <label>Activity name<input aria-label="Activity name" maxLength="140" value={editDraft.title} onChange={(event) => setEditDraft((current) => ({ ...current, title: event.target.value }))} /></label>
                    <label>Description<textarea aria-label="Activity description" maxLength="600" value={editDraft.description} onChange={(event) => setEditDraft((current) => ({ ...current, description: event.target.value }))} /></label>
                    <label>Estimated cost ({activity.currency})<input aria-label="Estimated cost" type="number" min="0" step="0.01" value={editDraft.estimated_cost} onChange={(event) => setEditDraft((current) => ({ ...current, estimated_cost: event.target.value }))} /></label>
                    {editError && <div className="error" role="alert">{editError}</div>}
                    <div className="account-actions"><button type="button" className="secondary" onClick={() => applyEdit(day.day, index)}>Apply edit</button><button type="button" className="text-button" onClick={() => { setEditing(null); setEditError(""); }}>Cancel</button></div>
                  </div> : <>
                    <small><Clock3 size={12} /> {activity.time || "Time flexible"}{activity.end_time ? `–${activity.end_time}` : ""} · {activity.category}{activity.duration_minutes ? ` · ${activity.duration_minutes} min` : ""}</small>
                    <strong>{activity.title}</strong><p>{activity.description}</p>{activity.practical_note && <p className="practical-note">Tip: {activity.practical_note}</p>}
                    <em>{money(activity.estimated_cost, activity.currency)} estimated</em><button className="text-button edit-button" type="button" onClick={() => startEdit(day.day, index, activity)}>Edit activity</button>
                  </>}</div>
                </div>;
              })}
                {day.meals.map((meal) => <div className="timeline-item" key={`${day.day}-${meal.meal}`}><span className="timeline-icon meal"><Utensils size={14} /></span><div><small>{meal.meal}</small><strong>{meal.name}</strong><p>{meal.notes}</p><em>{money(meal.estimated_cost, meal.currency)} estimated</em></div></div>)}</div><div className="transport"><MapPin size={14} />{day.transport_note}</div><button className="secondary day-regenerate" type="button" disabled={Boolean(busy)} onClick={() => regenerateOne(day.day)}>{busy === `day-${day.day}` ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />} Regenerate day {day.day}</button>
            </article>)}
            <div className="disclaimer">Suggestions and costs are estimates, not live-verified facts. Check current prices, opening hours, transport, and availability before travel.</div><div className="itinerary-actions"><button className="primary" type="button" disabled={Boolean(busy)} onClick={regenerateWhole}><RefreshCw size={15} /> Regenerate itinerary</button>{session && <button className="secondary" type="button" disabled={Boolean(busy)} onClick={saveCurrent}><Save size={15} /> {busy === "save" ? "Saving…" : tripId ? "Save changes" : "Save trip"}</button>}</div>{dirty && <p className="saved-note">Unsaved changes</p>}
          </>}
        </section>}
      </section>}

      {page === "login" && <section className="auth-page"><div className="auth-card"><div className="kicker">WELCOME BACK</div><h1>Log in to Wayfarer</h1><p className="muted">Access your saved trips and keep planning.</p>{!accountConfigured && <div className="notice" role="status">Supabase Auth is unavailable. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in frontend/.env.local, then restart Vite.</div>}{error && <div className="error" role="alert">{error}</div>}{notice && <div className="notice" role="status">{notice}</div>}<form onSubmit={(event) => submitAccount(event, "signin")}><label htmlFor="login-email">Email</label><input id="login-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /><label htmlFor="login-password">Password</label><input id="login-password" type="password" autoComplete="current-password" minLength="8" value={password} onChange={(event) => setPassword(event.target.value)} required /><button className="primary" type="submit" disabled={Boolean(busy) || !accountConfigured}>Log in</button></form><p>New here? {navLink("/signup","Create an account",false)}</p></div></section>}
      {page === "signup" && <section className="auth-page"><div className="auth-card"><div className="kicker">START PLANNING</div><h1>Create your account</h1><p className="muted">Save your itineraries and return to them anytime.</p>{!accountConfigured && <div className="notice" role="status">Supabase Auth is unavailable. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in frontend/.env.local, then restart Vite.</div>}{error && <div className="error" role="alert">{error}</div>}{notice && <div className="notice" role="status">{notice}</div>}<form onSubmit={(event) => submitAccount(event, "signup")}><label htmlFor="signup-email">Email</label><input id="signup-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={signupLocked} required /><label htmlFor="signup-password">Password</label><input id="signup-password" type="password" autoComplete="new-password" minLength="8" value={password} onChange={(event) => setPassword(event.target.value)} disabled={signupLocked} required /><button className="primary" type="submit" disabled={Boolean(busy) || !accountConfigured || signupLocked}>{signupLocked ? (error ? "Email limit reached" : "Confirmation pending") : "Create account"}</button></form><p>Already registered? {navLink("/login","Log in",false)}</p></div></section>}
      {page === "not-found" && <section className="auth-page"><div className="auth-card"><div className="kicker">404</div><h1>Page not found</h1><p className="muted">This route is not part of the travel planner.</p><button className="primary" onClick={() => navigate("/")}>Back to home</button></div></section>}
      {page === "saved-trips" && <section className="saved-section" id="saved-trips"><div className="kicker">YOUR ACCOUNT</div><h1>Saved trips</h1>{authLoading ? <div className="empty-state" role="status">Checking your sign-in…</div> : !session ? <div className="empty-state"><p className="muted">Log in to see and manage trips saved to your account.</p><button className="secondary" type="button" onClick={() => navigate("/login")}>Log in</button></div> : tripsLoading ? <div className="empty-state" role="status">Loading your saved trips…</div> : error ? <div className="error" role="alert">{error}</div> : savedTrips.length === 0 ? <div className="empty-state"><p className="muted">No saved trips yet. Plan a trip and save it to your account.</p><button className="primary" type="button" onClick={() => navigate("/plan-trip")}>Plan a trip</button></div> : <div className="saved-grid">{savedTrips.map((trip) => <article className="saved-card" key={trip.id}><div><small>{displayDate(trip.start_date)} – {displayDate(trip.end_date)}</small><h2>{trip.destination}</h2><p>{money(trip.budget, trip.currency)} · {trip.title}</p></div><div className="account-actions"><button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => openTrip(trip.id)}><Bookmark size={14} /> Open</button><button type="button" className="icon-button" aria-label={`Delete ${trip.destination} trip`} disabled={Boolean(busy)} onClick={() => removeTrip(trip)}><Trash2 size={15} /></button></div></article>)}</div>}</section>}
      {page === "home" && <section className="bottom-strip"><strong>MADE FOR THE WAY YOU WANDER</strong><div><span><Compass size={15} /> Find your own way</span><span><Wallet size={15} /> Budget estimates</span><span><Utensils size={15} /> Taste something new</span></div></section>}
    </main>
    <footer><div className="brand"><span className="brand-icon"><Compass size={17} /></span>wayfarer<span className="coral">.</span></div><p>Thoughtful trips, one little adventure at a time.</p><small>AI suggestions can be inaccurate. Confirm details before booking.</small></footer>
  </div>;
}
