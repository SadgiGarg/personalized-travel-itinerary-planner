# Production deployment guide

This guide deploys the existing React app to Vercel, the FastAPI app to Render, and uses your existing Supabase project. No live service configuration or database changes are performed by these instructions. Keep all secret values in provider settings and enter placeholders only in documentation.

## Environment variables

| Variable | Where | Value |
| --- | --- | --- |
| `VITE_API_BASE_URL` | Vercel build environment | The actual HTTPS URL assigned to your Render API service (copy it from Render; no trailing slash) |
| `VITE_SUPABASE_URL` | Vercel build environment | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Vercel build environment | Supabase publishable/anon browser key; never a service-role key |
| `VITE_SUPABASE_REDIRECT_URL` | Vercel build environment | `https://YOUR-FRONTEND-DOMAIN/login?confirmed=1` |
| `APP_ENV` | Render | `production` |
| `CORS_ORIGINS` | Render | Exact comma-separated frontend origins, such as `https://YOUR-FRONTEND-DOMAIN,https://YOUR-PROJECT.vercel.app` |
| `SUPABASE_URL` | Render | Supabase project URL |
| `SUPABASE_ANON_KEY` | Render | Supabase publishable/anon key; the API forwards the user's JWT and relies on RLS |
| `LLM_API_BASE_URL` | Render, optional | Provider's OpenAI-compatible API base URL; server appends `/chat/completions` |
| `LLM_API_KEY` | Render, optional | Provider secret key |
| `LLM_MODEL` | Render, optional | Provider model identifier |
| `LLM_TIMEOUT_SECONDS` | Render, optional | Request timeout; default `45` |
| `AI_RATE_LIMIT_REQUESTS` | Render, optional | Per-process live generation limit; default `10` |
| `AI_RATE_LIMIT_WINDOW_SECONDS` | Render, optional | Rate limit window; default `60` |

Set all three LLM variables together or leave all blank. In production, leaving them blank safely disables itinerary generation with a `503`; configure a real provider to make the main planning feature available. The app does not prove live generation without real provider credentials. Set provider-side spending caps. The built-in rate limiter is in-process and does not coordinate across multiple workers or instances; use a shared gateway limit before public launch if scaling beyond one process.

## 1. Deploy the API on Render

1. In Render, create a new Blueprint from this GitHub repository and use the included `render.yaml`, or create a Web Service manually with root directory `backend`, build command `pip install -r requirements.txt`, and start command `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
2. Add the Render environment variables from the table. `CORS_ORIGINS` must contain the final frontend origin(s), without a wildcard. It is safe to update this value after Vercel assigns the initial URL.
3. Deploy. Render should check `/health`; confirm `https://YOUR-API.onrender.com/health` returns a small JSON `ok` status.
4. Keep `SUPABASE_ANON_KEY` and `LLM_API_KEY` in Render's secret environment settings. Never add service-role keys.

## 2. Deploy the frontend on Vercel

1. Import the same repository into Vercel.
2. Set the project root directory to `frontend`. Vercel will use `npm run build` and Vite's `dist` output.
3. Add `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_SUPABASE_REDIRECT_URL` as Vercel environment variables for Production (and Preview if you intend to test previews). Set `VITE_API_BASE_URL` to the actual HTTPS URL assigned to your Render service, copied from the Render dashboard. This is required because Vercel and Render host separate services. Leaving it blank makes the browser use the Vercel origin for API calls, which will not reach FastAPI. Vite embeds `VITE_` values in browser assets, so only the Supabase public key belongs there.
4. Deploy and note the resulting HTTPS origin. The included `frontend/vercel.json` rewrites browser routes to `index.html`, so refreshing `/login`, `/saved-trips`, or `/itinerary/ID` loads the app.
5. Add this origin and any required preview origin to Render's `CORS_ORIGINS`, then redeploy the API if needed. Keep origins exact and avoid broad preview wildcards for a public production app.

Changing Vercel environment values requires a new frontend deployment.

## 3. Configure Supabase

1. In the intended Supabase project, review and apply `supabase/schema.sql` using the SQL Editor. It enables RLS and owner-only select/insert/update/delete policies. Do not disable RLS or use the service-role key in the app.
2. In **Authentication → URL Configuration**, set **Site URL** to the production frontend origin, for example `https://YOUR-FRONTEND-DOMAIN`.
3. Add the exact redirect URL `https://YOUR-FRONTEND-DOMAIN/login?confirmed=1` under allowed Redirect URLs. Add exact Vercel preview callbacks only if previews need signup testing. Keep email confirmation enabled.
4. Configure the frontend and backend Supabase variables as listed above. Signup and login call Supabase Auth from the browser; saved trips pass the user's access token to the API and are filtered by database RLS.
5. For reliable authentication emails, configure a custom SMTP provider and a verified sender domain in Supabase. Default email delivery can be limited and is not a dependable production mail service.

## 4. Verify the deployed workflow

Use two test accounts with non-sensitive test data. Automated local tests do not verify deployed Supabase, email, CORS, or provider credentials.

1. Open the deployed frontend and refresh each route directly: `/login`, `/signup`, `/plan-trip`, and `/saved-trips`.
2. Create an account, confirm the email, sign in, refresh, and verify the session is restored. Sign out and verify protected trip screens ask you to sign in.
3. Generate an itinerary. Confirm whether it is labeled demo or live; do not infer live AI works from a successful demo response.
4. Save the trip, reopen it, edit an activity, save changes, delete it, and verify it disappears.
5. Sign in as the second account and verify it cannot see or access the first account's trip. The backend tests simulate ownership behavior; only this live check validates your deployed project configuration.
6. Inspect browser Console and Network for failed requests. Confirm API requests reach the Render origin and auth calls reach the intended Supabase project. Check Render logs for server-side diagnostics without exposing them to users.

## Troubleshooting

- **Browser reports a CORS error:** compare the page's exact origin (including `https`) with Render `CORS_ORIGINS`; save and redeploy Render.
- **API unavailable or Vercel returns API 404:** set `VITE_API_BASE_URL` to the Render service origin and redeploy Vercel. The Vercel rewrite handles frontend routes, not API hosting.
- **Refresh returns 404:** confirm Vercel's project root is `frontend` and `frontend/vercel.json` is included in the deployment.
- **Auth redirect is rejected:** match the complete callback URL, including `/login?confirmed=1`, in Supabase Redirect URLs; verify Site URL and redeploy after changing the Vercel redirect variable.
- **Saved trips report storage not configured:** check Render's `SUPABASE_URL` and `SUPABASE_ANON_KEY`, then check that the schema was applied to that same project.
- **Signup email does not arrive:** check spam and Supabase Auth logs/rate limits; set up custom SMTP and a verified sender for production.
- **Live generation is not configured:** set all three LLM variables on Render. Provider outages, timeouts, invalid output, and quota errors are surfaced as safe generic API errors. Check private Render logs and provider status without sharing keys.
- **Changes do not appear:** push the intended code to GitHub and inspect the Vercel/Render deployment logs. Vercel frontend environment changes require a new build; Render service settings may require a redeploy.

## Future updates

Commit and push changes to the connected GitHub branch when you are ready. Vercel and Render can deploy that branch automatically. Review both build logs and repeat the deployed workflow checks after changes to auth, database, API, or environment configuration. Database schema changes should be reviewed and applied deliberately in Supabase; they are not applied by the web deployment.
