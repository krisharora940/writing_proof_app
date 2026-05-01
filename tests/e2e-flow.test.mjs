import assert from "node:assert/strict";
import test from "node:test";

import { createSessionCookieValue, getDemoAuthenticatedUser, readSessionUserId, SESSION_COOKIE } from "../lib/auth.ts";
import { DEMO_PROFESSOR_ID, DEMO_SESSION_ID, DEMO_STUDENT_ID } from "../lib/demo-ids.ts";
import {
  appendWritingEvent,
  createDemoRepositoryState,
  getCurrentStudentSessionDemo,
  getProfessorReportDemo,
  listAssignmentSubmissionsDemo,
  listProfessorAssignmentsDemo,
  lockSubmission,
  storeTimedSummary
} from "../lib/server-repository.ts";

test("student login loads a session, writes draft events, submits, and stores timed summary", () => {
  const state = createDemoRepositoryState(1000);
  const cookieValue = createSessionCookieValue(DEMO_STUDENT_ID);
  const request = new Request("http://localhost/api/assignments/current", {
    headers: { cookie: `${SESSION_COOKIE}=${cookieValue}` }
  });
  const studentId = readSessionUserId(request);
  const user = studentId ? getDemoAuthenticatedUser(studentId) : null;

  assert.equal(user?.role, "student");

  const session = getCurrentStudentSessionDemo(state, user.id);
  assert.equal(session.ok, true);
  assert.equal(session.value.session.id, DEMO_SESSION_ID);

  const event = appendWritingEvent(state, {
    sessionId: session.value.session.id,
    studentId: user.id,
    event: {
      type: "insert",
      at: 1100,
      start: 0,
      removed: "",
      added: "Process evidence supports revision.",
      addedWords: 4
    }
  });
  assert.equal(event.ok, true);

  const lock = lockSubmission(state, {
    sessionId: session.value.session.id,
    studentId: user.id,
    submittedText: "Process evidence supports revision.",
    snapshot: { at: 1200, text: "Process evidence supports revision." }
  });
  assert.equal(lock.ok, true);

  const summary = storeTimedSummary(state, {
    sessionId: session.value.session.id,
    studentId: user.id,
    startedAt: 1300,
    completedAt: 1400,
    summaryText: "Process evidence and revision were discussed."
  });
  assert.equal(summary.ok, true);
  assert.equal(state.session.status, "summary_submitted");
});

test("professor assignment to submission to report flow returns review data", () => {
  const state = createDemoRepositoryState(1000);
  appendWritingEvent(state, {
    sessionId: DEMO_SESSION_ID,
    studentId: DEMO_STUDENT_ID,
    event: {
      type: "insert",
      at: 1100,
      start: 0,
      removed: "",
      added: "Process evidence supports revision.",
      addedWords: 4
    }
  });
  lockSubmission(state, {
    sessionId: DEMO_SESSION_ID,
    studentId: DEMO_STUDENT_ID,
    submittedText: "Process evidence supports revision.",
    snapshot: { at: 1200, text: "Process evidence supports revision." }
  });
  storeTimedSummary(state, {
    sessionId: DEMO_SESSION_ID,
    studentId: DEMO_STUDENT_ID,
    startedAt: 1300,
    completedAt: 1400,
    summaryText: "Process evidence and revision were discussed."
  });

  const assignments = listProfessorAssignmentsDemo(DEMO_PROFESSOR_ID);
  assert.equal(assignments.ok, true);

  const submissions = listAssignmentSubmissionsDemo(state, assignments.value.assignments[0].id, DEMO_PROFESSOR_ID);
  assert.equal(submissions.ok, true);
  assert.equal(submissions.value.submissions[0].status, "summary_submitted");

  const report = getProfessorReportDemo(state, submissions.value.submissions[0].sessionId, DEMO_PROFESSOR_ID);
  assert.equal(report.ok, true);
  assert.equal(report.value.submittedText, "Process evidence supports revision.");
  assert.ok(report.value.observations.some((item) => item.group === "Comprehension Check"));
});
