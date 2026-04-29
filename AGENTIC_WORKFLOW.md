# Agentic Workflow

Purpose: build Verified Writing from prototype to production app with small, reviewable agent passes.

## Product Direction

Verified Writing records how a paper was written, not whether the final text "looks AI generated."

The product should stay neutral:

- factual writing events
- immutable submission evidence
- student comprehension checks
- professor review tools
- no misconduct labels or final suspicion scores

## Agent Roles

Use one lead agent and focused worker agents.

**Lead Agent**
Owns scope, sequencing, acceptance criteria, and final integration. Keeps changes small.

**Product Agent**
Turns vague ideas into user stories. Defines what students, professors, and admins need next.

**Architecture Agent**
Designs data model, service boundaries, event durability, replay reconstruction, and auth flow.

**Frontend Agent**
Builds the student editor, professor report, replay UI, and role-specific navigation.

**Backend Agent**
Builds persistence, submissions, event ingestion, snapshots, and report APIs.

**AI Evaluation Agent**
Builds summary-to-paper comparison with schema-validated LLM output and deterministic fallbacks.

**QA Agent**
Adds tests for the complete submission flow, event metrics, replay, and report generation.

**Safety Agent**
Checks privacy, evidence wording, abuse cases, data retention, and FERPA-style handling.

## Build Sequence

1. Stabilize the Next app
   - restore missing global CSS
   - remove the static prototype once the app matches it
   - add basic typecheck/build verification

2. Define the domain model
   - assignments
   - users and roles
   - writing sessions
   - writing events
   - immutable submission snapshots
   - timed summaries
   - professor reports

3. Add persistence
   - Postgres schema
   - append-only event log
   - server-side submission lock
   - replay reconstruction from events and snapshots

4. Add auth and roles
   - student workspace
   - professor workspace
   - assignment ownership
   - access checks on every report and submission

5. Add AI comparison
   - summarize submitted paper key claims
   - compare timed summary to paper
   - return structured observations only
   - validate output with a schema
   - log model inputs/outputs for auditability

6. Add professor workflow
   - assignment dashboard
   - submission list
   - neutral evidence report
   - replay timeline
   - exportable report

7. Harden and test
   - Playwright full-flow tests
   - unit tests for event metrics
   - server tests for immutable snapshots
   - privacy review
   - deployment checklist

## Agent Handoff Format

Each agent returns:

```text
Goal:
What changed:
Files touched:
Verification:
Open risks:
Next step:
```

## Working Prompts

**Planning prompt**

```text
You are the Product Agent for Verified Writing. Read the repo and produce the next 5 user stories needed to move from prototype to production. Keep each story testable. Avoid misconduct labels or final AI-detection scores.
```

**Architecture prompt**

```text
You are the Architecture Agent. Design the Postgres schema and API boundaries for append-only writing events, immutable submissions, timed summaries, and professor reports. Prefer simple tables and explicit access checks.
```

**Frontend prompt**

```text
You are the Frontend Agent. Implement the next UI slice using the existing Next app style. Keep the student writing loop fast, the professor report factual, and the replay easy to scan.
```

**Backend prompt**

```text
You are the Backend Agent. Implement persistence for the selected slice. Preserve append-only event history, immutable submitted text, and role-based access boundaries.
```

**AI evaluation prompt**

```text
You are the AI Evaluation Agent. Add schema-validated summary-to-paper comparison. Output neutral observations with evidence, not suspicion scores or misconduct language.
```

**QA prompt**

```text
You are the QA Agent. Add tests for the current slice. Cover typing, paste events, deletion events, submission lock, timed summary, report rendering, and replay.
```

## Current Next Slice

Start here:

1. add tests for `lib/writing-events.ts`
2. replace local client state with persisted assignments/submissions
3. add authenticated student/professor roles
4. reconstruct replay server-side from snapshots and events
5. add schema-validated LLM comparison for the timed summary

Then move to persistence.
