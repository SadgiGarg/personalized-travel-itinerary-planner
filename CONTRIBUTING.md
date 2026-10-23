# Contributing

Thanks for helping improve Personalized Travel Itinerary Planner.

## Workflow
1. Create a short-lived feature branch for focused changes.
2. Keep commits focused with descriptive messages.
3. Add or update tests for backend behavior.
4. Run backend tests and the frontend production build before a pull request.
5. Never commit API keys, personal access tokens, Supabase secrets, or real `.env` files.

## Local checks
Backend from `backend/`:
```bash
pytest
```
Frontend from `frontend/`:
```bash
npm install
npm run build
```

## Conventions
- Keep HTTP and schema concerns out of generation services.
- Validate external model output before returning it to the client.
- Prefer accessible labels, semantic HTML, and keyboard-operable controls.
- Clearly distinguish generated estimates from verified live information.
