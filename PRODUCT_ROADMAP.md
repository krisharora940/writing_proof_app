# DraftProof Product Roadmap

This roadmap turns the current prototype into a full web app for browser-based writing process evidence.

## Product Principle

DraftProof records how a paper was written. It should not decide whether misconduct happened.

The product should avoid:

- behavioral integrity scores
- suspicion scores
- cheating labels
- AI prose-origin detection

Use evidence tags instead. Tags describe factual process signals and let instructors interpret them in context.

Important nuance: deletion events, idle time, and revision bursts are normal parts of writing. They are not inherently suspicious. In some cases, unusually linear typing may be more notable than revision-heavy writing, but interpretation algorithms should come later. The MVP should prioritize reliable capture, storage, replay, and reporting.

## Target App

DraftProof should become a professional SaaS-style web app with:

- public landing page
- signup and login
- student dashboard
- professor dashboard
- assignment creation
- student writing workspace
- autosaved writing events
- immutable submission lock
- timed comprehension summary
- professor evidence report
- replay timeline
- evidence tag review
- CSV/PDF export
- production deployment

## Current Baseline

Already present:

- Next.js app
- API routes
- Postgres schema
- demo auth/session handling
- assignment and roster APIs
- writing event capture
- submission locking
- timed summaries
- replay reconstruction
- professor reports
- report export foundation
- unit and flow tests

Main gaps:

- production signup/login
- professional route structure and page UX
- polished role dashboards
- richer telemetry
- evidence tagging system
- browser-ready deployment
- accessibility and privacy hardening

## Roadmap Phases

| Phase | Goal | Outcome |
| --- | --- | --- |
| 1 | Product shell | Real website structure, auth screens, navigation, role routing |
| 2 | Auth + accounts | Signup/login, student/professor roles, protected pages |
| 3 | Assignment workflow | Professors create assignments, invite/enroll students, students see work |
| 4 | Writing workspace | Polished editor, autosave status, event capture, session recovery |
| 5 | Evidence foundation | Append-only events, immutable submissions, replay reconstruction |
| 6 | Tagging system | Factual evidence tags instead of behavioral scores |
| 7 | Professor review | Dashboard, reports, replay, timeline markers, paste cards |
| 8 | AI + plagiarism integrations | Structured summary comparison first, plagiarism later |
| 9 | Hardening | Accessibility, privacy, retention, security, CI, deployment |
| 10 | Launch readiness | Production hosting, analytics, onboarding, billing-ready architecture |

## Sprint Plan

### Sprint 1: App Shell + Navigation

Build the real product frame around the existing app.

Deliverables:

- public home page
- `/login`
- `/signup`
- `/student`
- `/professor`
- shared layout and role-aware navigation
- professional responsive UI

Acceptance:

- unauthenticated users only access public/auth pages
- students and professors land in different dashboards
- app looks like clean production software on desktop and mobile

### Sprint 2: Real Auth

Replace demo-only login with production-ready account access.

Deliverables:

- signup flow
- login/logout
- password or provider-backed auth
- role assignment
- session security review
- auth tests

Acceptance:

- professors can create accounts
- students can create or accept accounts
- API routes enforce role access
- demo login is disabled in production

### Sprint 3: Professor Assignment Workflow

Make professors productive.

Deliverables:

- professor dashboard
- assignment creation/editing
- student enrollment or invite flow
- assignment list and roster
- due dates
- empty/loading/error states

Acceptance:

- professor can create an assignment and enroll students
- student sees enrolled assignment
- professor cannot access another professor's assignment

### Sprint 4: Student Writing Workspace

Polish the core student experience.

Deliverables:

- assignment detail page
- writing editor page
- autosave states: `Saved`, `Saving...`, `Save failed`
- submission confirmation
- locked post-submit state
- timed summary flow

Acceptance:

- student can write, leave, return, and continue from saved text
- submission creates an immutable snapshot
- student cannot edit after submit
- timed summary starts only after submission

### Sprint 5: Evidence Event Model Upgrade

Close the main spec gaps around process capture.

Deliverables:

- session numbering
- idle gap recording as context
- tab/window visibility events
- rolling WPM windows
- paste range storage
- paste changed/unchanged analysis
- event schema migration

Acceptance:

- timeline can show `Session 1`, `Session 2`, etc.
- paste events can show whether pasted text was unchanged, edited, or removed
- idle/passive time is excluded from active writing time
- events remain append-only

### Sprint 6: Evidence Tagging System

Replace behavioral scoring with tags.

Deliverables:

- `evidence_tags` table or JSON-backed tag model
- rule-based tag generation from event metrics
- tag categories: `paste`, `revision`, `timing`, `session`, `summary`, `source`
- professor-facing tag language
- no aggregate score

Acceptance:

- reports show factual tags, not scores
- tags link to underlying evidence
- instructors can filter by tag
- UI contains no `behavioral score`, `suspicion score`, or automatic misconduct language

### Sprint 7: Replay + Review UX

Make evidence easy to inspect.

Deliverables:

- replay speeds: `0.25x`, `0.5x`, `1x`, `2x`, `5x`, `10x`
- timeline markers
- optional pause at important evidence moments
- paste event cards
- cards jump replay to exact document state
- tabs: `Overview`, `Tags`, `Replay`, `Submission`, `Summary`

Acceptance:

- professor can scan a submission quickly
- selecting a paste tag moves replay to that moment
- replay remains server-derived from events/snapshots

### Sprint 8: AI Summary Comparison

Add neutral LLM-backed comparison.

Deliverables:

- structured LLM schema
- summary-to-paper claim comparison
- deterministic fallback
- AI evaluation logs
- cost/error handling
- prompt/version audit trail

Acceptance:

- AI output produces observations/tags only
- no AI-authorship detection
- failed AI calls degrade gracefully
- logs store model, schema version, hashes, latency, and fallback status

### Sprint 9: Export + Reporting

Make professor review portable.

Deliverables:

- PDF export
- CSV export
- report download flow
- institutional-friendly report language
- report generation history

Acceptance:

- professor can export a submission report
- export includes assignment, student, submission time, tags, summary comparison, and replay metrics
- export does not include hidden scores

### Sprint 10: Production Hardening

Prepare for real users.

Deliverables:

- accessibility pass
- keyboard navigation
- responsive QA
- rate limits
- CSRF/CSP review
- data retention policy
- audit logging
- error tracking
- CI build/test pipeline
- deployment checklist

Acceptance:

- app passes build, typecheck, and tests
- core flows work in deployed browser environment
- student data handling is documented
- production env requires real secrets and database config

## Architecture Direction

Keep the current stack unless there is a specific reason to change:

- Next.js App Router
- TypeScript
- PostgreSQL
- existing API routes
- existing repository/service pattern
- server-side access checks
- append-only evidence tables

Near-term architecture work should harden the existing foundation rather than replace it.

Key additions:

- real auth provider or hardened first-party auth
- route groups for public/auth/student/professor areas
- evidence tag model
- richer event types
- deployment config
- accessibility and browser testing

## Priority Order

1. Real app shell
2. Signup/login
3. Role dashboards
4. Assignment workflow
5. Student writing/autosave
6. Immutable submission flow
7. Evidence tags
8. Replay polish
9. AI comparison
10. Export/deployment/hardening

Do not start plagiarism integration until persistence, auth, tagging, reports, and replay are solid.

## Definition Of Done

The product is fully fledged when a professor can sign up, create an assignment, enroll students, receive submissions, review tagged process evidence, inspect replay, compare timed summaries, and export a neutral report from a deployed website.

No behavioral score. Evidence tags only.
