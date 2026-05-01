# Production Hardening

Finding 5 is closed for code review, but production requires real auth and operating controls.

## Auth

- Configure `AUTH_PROVIDER_USERINFO_URL` and, if needed, `AUTH_PROVIDER_NAME`.
- Populate `auth_identities` for every production user before launch.
- Set `AUTH_SESSION_SECRET` to a high-entropy value in the deployment secret store.
- Keep `ALLOW_DEMO_LOGIN` unset in production.
- Demo login is hard-blocked when common deployed-environment markers are present (`VERCEL`, `RENDER`, `FLY_APP_NAME`, `RAILWAY_ENVIRONMENT`, `NETLIFY`).

## FERPA-Style Access Assumptions

- Students can only load, write, submit, summarize, or reset their own sessions.
- Professors can only list assignments through `assignment_instructors`.
- Reports and exports are scoped by professor assignment ownership.
- AI audit logs should store hashes and structured outputs, not raw paper text.

## Retention

- Keep immutable writing evidence for the school-approved review window.
- Archive sessions by setting `writing_sessions.status = 'archived'` and `archived_at`.
- Purge or anonymize `writing_events`, `submission_snapshots`, `timed_summaries`, `professor_reports`, and `ai_evaluation_logs` after the approved retention window.
- Document who can approve holds that suspend deletion.

## Secret Rotation

- Rotate `AUTH_SESSION_SECRET` with a planned logout window.
- Rotate provider/client secrets in the identity provider first, then deployment secrets.
- Rotate `OPENAI_API_KEY` or model-provider keys without changing stored reports.
- After rotation, verify login, session load, report generation, export, and AI audit logging.

## Abuse Controls

- Auth login is rate-limited.
- Report read and export endpoints are rate-limited.
- Keep provider-side auth throttling enabled.
- Add infrastructure-level limits at the edge or load balancer for production traffic.
