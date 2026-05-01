import assert from "node:assert/strict";
import test from "node:test";

import {
  appendWritingEvent,
  createDemoRepositoryState,
  getProfessorReportDemo,
  lockSubmission,
  storeTimedSummary
} from "../lib/server-repository.ts";

const DEMO_STUDENT_ID = "11111111-1111-4111-8111-111111111111";
const DEMO_PROFESSOR_ID = "22222222-2222-4222-8222-222222222222";
const DEMO_SESSION_ID = "44444444-4444-4444-8444-444444444444";

function makeWords(count) {
  return Array.from({ length: count }, (_, index) => `word${index + 1}`).join(" ");
}

test("appendWritingEvent appends events while the session is unlocked", () => {
  const state = createDemoRepositoryState(1000);
  const result = appendWritingEvent(state, {
    sessionId: DEMO_SESSION_ID,
    studentId: DEMO_STUDENT_ID,
    event: { type: "insert", at: 1100, start: 0, removed: "", added: "Draft", addedWords: 1 }
  });

  assert.equal(result.ok, true);
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].type, "insert");
});

test("appendWritingEvent rejects wrong students and locked sessions", () => {
  const state = createDemoRepositoryState(1000);

  assert.deepEqual(appendWritingEvent(state, {
    sessionId: DEMO_SESSION_ID,
    studentId: "other-student",
    event: { type: "insert", at: 1100 }
  }), { ok: false, status: 403, error: "Student cannot access this session." });

  lockSubmission(state, {
    sessionId: DEMO_SESSION_ID,
    studentId: DEMO_STUDENT_ID,
    submittedText: "Final",
    snapshot: { at: 1200, text: "Final" }
  });

  const lockedResult = appendWritingEvent(state, {
    sessionId: DEMO_SESSION_ID,
    studentId: DEMO_STUDENT_ID,
    event: { type: "insert", at: 1300 }
  });

  assert.equal(lockedResult.ok, false);
  assert.equal(lockedResult.status, 409);
});

test("lockSubmission stores immutable submitted text and rejects a second lock", () => {
  const state = createDemoRepositoryState(1000);
  const result = lockSubmission(state, {
    sessionId: DEMO_SESSION_ID,
    studentId: DEMO_STUDENT_ID,
    submittedText: "Final paper",
    snapshot: { at: 1200, text: "Final paper" }
  });

  assert.deepEqual(result, {
    ok: true,
    value: { submittedAt: 1200, lockedAt: 1200, snapshotIndex: 1 }
  });
  assert.equal(state.submittedText, "Final paper");
  assert.equal(state.session.lockedAt, 1200);

  const secondResult = lockSubmission(state, {
    sessionId: DEMO_SESSION_ID,
    studentId: DEMO_STUDENT_ID,
    submittedText: "Changed",
    snapshot: { at: 1300, text: "Changed" }
  });

  assert.equal(secondResult.ok, false);
  assert.equal(secondResult.status, 409);
});

test("storeTimedSummary only stores once after submission", () => {
  const state = createDemoRepositoryState(1000);

  assert.equal(storeTimedSummary(state, {
    sessionId: DEMO_SESSION_ID,
    studentId: DEMO_STUDENT_ID,
    startedAt: 1000,
    completedAt: 1100,
    summaryText: "Too early"
  }).ok, false);

  lockSubmission(state, {
    sessionId: DEMO_SESSION_ID,
    studentId: DEMO_STUDENT_ID,
    submittedText: "Final paper",
    snapshot: { at: 1200, text: "Final paper" }
  });

  const result = storeTimedSummary(state, {
    sessionId: DEMO_SESSION_ID,
    studentId: DEMO_STUDENT_ID,
    startedAt: 1300,
    completedAt: 1400,
    summaryText: "Summary"
  });

  assert.equal(result.ok, true);
  assert.equal(state.timedSummary?.summaryText, "Summary");

  const secondResult = storeTimedSummary(state, {
    sessionId: DEMO_SESSION_ID,
    studentId: DEMO_STUDENT_ID,
    startedAt: 1500,
    completedAt: 1600,
    summaryText: "Second summary"
  });

  assert.equal(secondResult.ok, false);
  assert.equal(secondResult.status, 409);
});

test("getProfessorReportDemo only allows the owning demo professor", () => {
  const state = createDemoRepositoryState(1000);

  assert.deepEqual(getProfessorReportDemo(state, DEMO_SESSION_ID, "other-professor"), {
    ok: false,
    status: 403,
    error: "Professor cannot access this report."
  });

  assert.deepEqual(getProfessorReportDemo(state, "other-session", DEMO_PROFESSOR_ID), {
    ok: false,
    status: 404,
    error: "Report not found."
  });
});

test("getProfessorReportDemo returns report data for the owning professor", () => {
  const state = createDemoRepositoryState(1000);

  appendWritingEvent(state, {
    sessionId: DEMO_SESSION_ID,
    studentId: DEMO_STUDENT_ID,
    event: {
      type: "insert",
      at: 1100,
      start: 0,
      removed: "",
      added: "Process evidence supports revision",
      addedWords: 4
    }
  });
  lockSubmission(state, {
    sessionId: DEMO_SESSION_ID,
    studentId: DEMO_STUDENT_ID,
    submittedText: "Process evidence supports revision",
    snapshot: { at: 1200, text: "Process evidence supports revision" }
  });
  storeTimedSummary(state, {
    sessionId: DEMO_SESSION_ID,
    studentId: DEMO_STUDENT_ID,
    startedAt: 1300,
    completedAt: 1400,
    summaryText: "Process evidence and revision were discussed."
  });

  const result = getProfessorReportDemo(state, DEMO_SESSION_ID, DEMO_PROFESSOR_ID);

  assert.equal(result.ok, true);
  assert.equal(result.value.submittedText, "Process evidence supports revision");
  assert.ok(result.value.observations.some((item) => item.group === "Comprehension Check"));
  assert.ok(result.value.tags.some((item) => item.category === "Report Observation"));
  assert.equal(result.value.frames.length, 2);
});

test("getProfessorReportDemo returns neutral paste cards and timeline markers", () => {
  const state = createDemoRepositoryState(1000);
  const pastedText = makeWords(60);

  appendWritingEvent(state, {
    sessionId: DEMO_SESSION_ID,
    studentId: DEMO_STUDENT_ID,
    event: {
      type: "paste",
      at: 1100,
      start: 0,
      removed: "",
      added: pastedText,
      addedWords: 60,
      pasteWords: 60
    }
  });
  lockSubmission(state, {
    sessionId: DEMO_SESSION_ID,
    studentId: DEMO_STUDENT_ID,
    submittedText: pastedText,
    snapshot: { at: 1200, text: pastedText }
  });

  const result = getProfessorReportDemo(state, DEMO_SESSION_ID, DEMO_PROFESSOR_ID);

  assert.equal(result.ok, true);
  assert.equal(result.value.pasteEventCards.length, 1);
  assert.equal(result.value.pasteEventCards[0].wordCount, 60);
  assert.equal(result.value.pasteEventCards[0].replayFrameIndex, 1);
  assert.ok(result.value.pasteEventCards[0].tagIds.length > 0);
  assert.ok(result.value.timelineMarkers.some((item) => item.kind === "paste-event" && item.eventId === state.events[0].id));
  assert.ok(result.value.timelineMarkers.some((item) => item.kind === "draft-start"));
  assert.doesNotMatch(JSON.stringify({
    cards: result.value.pasteEventCards,
    markers: result.value.timelineMarkers
  }), /suspicion|cheat|score/i);
});
