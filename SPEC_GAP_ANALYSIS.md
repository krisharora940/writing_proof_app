# AuthorCheck Spec Gap Analysis

Source: `/Users/radhikaarora/Downloads/AuthorCheck_Project_Spec.docx`

## Product Direction

AuthorCheck is a process-first writing integrity platform. It should verify authorship through:

- behavioral telemetry from the writing session
- traditional plagiarism/source similarity checks
- timed comprehension verification after submission
- AI-assisted summary-to-paper comparison

The platform should not use AI prose-origin detection.

## Important Product Decision

The uploaded spec includes a `Behavioral Integrity Score`.

Earlier product direction in this repo rejects final scores or accusatory connotation. To stay aligned with that direction, the implementation should treat behavioral scoring rules as an internal prioritization and reporting system, not as a professor-facing final score.

Preferred professor-facing model:

- show factual observations
- show component-level evidence
- avoid a single integrity/suspicion/cheating score
- allow instructor interpretation

## Current MVP Coverage

Implemented:

- student writing editor
- insert/delete/paste event capture
- active writing time
- deletion event counting
- paper submission lock
- timed summary prompt
- neutral professor report
- basic rewind replay
- typed event-analysis logic in `lib/writing-events.ts`

Not yet implemented:

- TipTap/ProseMirror editor
- instructor assignment creation
- student/professor auth
- persisted database event logs
- immutable submission snapshots
- server-side replay reconstruction
- tab/window visibility logging
- rolling WPM windows
- session numbering and session-level metrics
- paste changed/unchanged tracking after paste
- chronological paste event cards linked to replay
- playback speed controls
- auto-pause replay at notable events
- visible auto-save status
- plagiarism API integration
- Claude/LLM structured cross-check
- CSV export
- data retention policy
- accessibility test pass

## Turnitin Clarity Comparison

Turnitin Clarity validates the process-capture category, but it is distributed as an institutional add-on to Feedback Studio rather than as a standalone instructor-first product. That creates a meaningful opening for AuthorCheck.

### Clarity Features To Adopt

These features should be implemented because they improve the evidence review workflow without changing the product philosophy:

- changed vs. unchanged paste tracking
- chronological paste event cards
- paste cards linked to the timeline state
- session numbering on the timeline
- active writing time that excludes idle/passive time
- visible auto-save status
- playback speed controls from slow review to fast scan
- replay auto-pause at notable events
- expandable observation cards with underlying metrics
- separate views for observations, replay, and flagged/notable events

### Clarity Features To Avoid

These features are useful in a broad writing platform, but they dilute AuthorCheck's initial product focus:

- AI writing assistant / AI chat
- citation assistant
- grammar checker

AuthorCheck should not build AI prose-origin detection. The AI should be used only for summary-to-paper comparison and structured reading assistance.

### Where AuthorCheck Can Be Stronger

AuthorCheck's differentiators should be:

- standalone self-serve distribution for individual instructors
- timed comprehension verification after submission
- transparent component-level behavioral observations
- neutral evidence language with no automatic misconduct verdict
- lower-friction pricing than institution-only enterprise procurement

The most important competitive point: Clarity is a well-executed institutional add-on. AuthorCheck can win by being standalone, instructor-first, and faster to adopt.

## Turnitin-Informed Requirements

Add these to the product backlog:

- For every paste event, store the pasted range and later compute whether that text was changed, partially changed, or left unchanged.
- Add `session_id` to event logs, where a new session starts after editor open/reopen or a long inactivity boundary.
- Show timeline sections as `Session 1`, `Session 2`, etc.
- Add `Saved`, `Saving...`, and `Save failed` states to the editor.
- Add replay speeds: `0.25x`, `0.5x`, `1x`, `2x`, `5x`, and `10x`.
- Add replay markers for paste events, deletion bursts, idle gaps, tab switches, and submission.
- During replay, optionally auto-pause at notable events.
- Add paste cards that jump replay to the exact document state when selected.
- Track active writing time as active interaction time, excluding idle time and passive scrolling.
- Keep all event cards factual, e.g. `Large paste event`, `Text unchanged after paste`, `Idle gap`, `Deletion burst`.

## Recommended Next Slice

Build persistence and assignment flow before adding external APIs.

1. Add database schema for users, assignments, submissions, event logs, snapshots, and comprehension responses.
2. Add assignment creation and a student assignment page.
3. Persist writing events append-only.
4. Persist immutable submitted essay text.
5. Reconstruct replay from stored snapshots/events.
6. Add paste changed/unchanged tracking.
7. Add session numbering and visible auto-save state.
8. Keep the current neutral report language.

This gives the product a real backend foundation before adding plagiarism or LLM costs.

## Later Slices

After persistence:

- replace `textarea` with TipTap
- add tab visibility events
- add changed/unchanged paste analysis
- add session-based timeline UX
- add replay speed controls and auto-pause at notable events
- add WPM window analysis
- add plagiarism provider integration
- add schema-validated LLM comparison
- add professor dashboard workflows
- add student self-view of their behavioral report
