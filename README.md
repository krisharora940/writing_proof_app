# Verified Writing MVP

Next.js prototype for a proof-of-process writing product.

See [AGENTIC_WORKFLOW.md](AGENTIC_WORKFLOW.md) for the agent workflow and [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md) for the product/engineering roadmap.

## Run

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:3000/`.

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
