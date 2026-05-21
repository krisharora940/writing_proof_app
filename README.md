# Verified Writing MVP

Next.js prototype for a proof-of-process writing product.

See [AGENTIC_WORKFLOW.md](AGENTIC_WORKFLOW.md) for the agent workflow and [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md) for the product/engineering roadmap.

## Run

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:3000/`.

## Deploy

Recommended stack for this repo:

- Vercel for the Next.js app and API routes
- Neon for Postgres
- Resend for transactional email

Required production environment variables:

- `DATABASE_URL`
- `AUTH_SESSION_SECRET`
- `AUTH_EMAIL_VERIFICATION_SECRET`
- `RESEND_API_KEY`
- `AUTH_FROM_EMAIL`
- `CRON_SECRET`

Pre-launch checks:

```bash
npm test
npm run typecheck
npm run build
npm run db:migrate
```

After deploy, confirm `GET /api/health` returns `200`.

## Current Scope

This MVP implements the first usable loop in a typed React app:

- student writing editor
- insert/delete/paste event capture
- active writing time and paste metrics
- paper submission lock
- timed post-submission summary
- neutral professor evidence report
- rewind timeline replay

The report intentionally avoids final scores and misconduct language. It presents factual observations only.

## Current Architecture

- `app/page.tsx`: student/professor UI and local client state
- `app/globals.css`: visual system and layout
- `lib/writing-events.ts`: typed event model, metrics, process observations, and summary comparison fallback

## Next Engineering Steps

Move from client-only state to persisted product behavior:

- Postgres event log
- immutable submission snapshots
- server-side replay reconstruction
- authenticated student/professor roles
- LLM-backed summary-to-paper comparison with schema validation
- Playwright tests for the full submission flow
