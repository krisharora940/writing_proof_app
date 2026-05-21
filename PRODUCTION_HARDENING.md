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

## Must Do Before First Live Users

- Set `DATABASE_URL`, `AUTH_SESSION_SECRET`, `AUTH_EMAIL_VERIFICATION_SECRET`, `RESEND_API_KEY`, `AUTH_FROM_EMAIL`, and `CRON_SECRET` in the deployment secret store.
- Verify the sender domain/address in Resend before enabling public signup.
- Run `npm run db:migrate` against production Neon before the first deploy.
- Confirm `/api/health` returns `200` in the deployed environment.
- Confirm signup, emailed code verification, login, logout, assignment load, submission lock, timed summary, professor report, and grade save on the deployed URL.
- Keep preview deployments protected until the above flow passes end to end.

## Implemented Launch Controls

- Cookie-auth mutation routes now reject cross-site requests using origin checks.
- `/api/health` reports database reachability and launch-critical environment presence.
- `signup_email_verifications` are stored with expiry and cleanup support.
- `/api/internal/maintenance/signup-verifications` deletes expired signup verifications when invoked with `CRON_SECRET`.
- `vercel.json` schedules daily cleanup for expired signup verifications.
