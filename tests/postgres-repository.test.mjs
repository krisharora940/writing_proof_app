import assert from "node:assert/strict";
import test from "node:test";

import {
  appendWritingEventPostgres,
  getCurrentStudentSessionPostgres,
  getProfessorReportPostgres,
  lockSubmissionPostgres,
  resetCurrentStudentSessionPostgres,
  storeTimedSummaryPostgres
} from "../lib/postgres-repository.ts";

function createMockClient(responses) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      const response = responses.shift();
      if (!response) return { rows: [] };
      return response;
    }
  };
}

test("appendWritingEventPostgres uses locked session ownership and parameterized insert", async () => {
  const client = createMockClient([
    { rows: [{ id: "session-1", student_id: "student-1", submitted_at: null, locked_at: null }] },
    { rows: [{ event_index: 2 }] },
    { rows: [{ id: "event-1", event_index: 2 }] }
  ]);

  const result = await appendWritingEventPostgres(client, {
    sessionId: "session-1",
    studentId: "student-1",
    event: { type: "insert", at: 1000, start: 0, added: "Hello", addedWords: 1 }
  });

  assert.equal(result.ok, true);
  assert.match(client.calls[0].sql, /for update/);
  assert.match(client.calls[2].sql, /insert into writing_events/);
  assert.deepEqual(client.calls[2].params.slice(0, 4), ["session-1", 2, "insert", 1000]);
  assert.match(client.calls[4].sql, /insert into writing_session_state/);
  assert.equal(client.calls[4].params[1], "Hello");
  assert.equal(client.calls[4].params[2].length, 64);
  assert.equal(client.calls[4].params[3], 2);
});

test("appendWritingEventPostgres rejects locked sessions", async () => {
  const client = createMockClient([
    { rows: [{ id: "session-1", student_id: "student-1", submitted_at: 1000, locked_at: 1000 }] }
  ]);

  const result = await appendWritingEventPostgres(client, {
    sessionId: "session-1",
    studentId: "student-1",
    event: { type: "insert", at: 1000 }
  });

  assert.deepEqual(result, { ok: false, status: 409, error: "Submission is locked." });
  assert.equal(client.calls.length, 1);
});

test("lockSubmissionPostgres inserts hashed snapshot and locks session", async () => {
  const client = createMockClient([
    { rows: [{ id: "session-1", student_id: "student-1", submitted_at: null, locked_at: null }] },
    { rows: [{ snapshot_index: 1 }] },
    { rows: [{ id: "snapshot-1", snapshot_index: 1 }] },
    { rows: [] },
    { rows: [] },
    { rows: [] }
  ]);

  const result = await lockSubmissionPostgres(client, {
    sessionId: "session-1",
    studentId: "student-1",
    submittedText: "Final",
    snapshot: { at: 2000, text: "Final" }
  });

  assert.deepEqual(result, { ok: true, value: { submittedAt: 2000, lockedAt: 2000, snapshotIndex: 1 } });
  assert.match(client.calls[2].sql, /insert into submission_snapshots/);
  assert.match(client.calls[2].sql, /'submitted'/);
  assert.match(client.calls[2].sql, /returning id, snapshot_index/);
  assert.equal(client.calls[2].params[4].length, 64);
  assert.match(client.calls[3].sql, /update writing_sessions/);
  assert.match(client.calls[3].sql, /status = 'summary_pending'/);
  assert.match(client.calls[4].sql, /insert into submissions/);
  assert.equal(client.calls[4].params[1], "snapshot-1");
  assert.match(client.calls[5].sql, /insert into writing_session_state/);
});

test("storeTimedSummaryPostgres inserts one hashed summary after submission", async () => {
  const client = createMockClient([
    { rows: [{ id: "session-1", student_id: "student-1", submitted_at: 1000, locked_at: 1000 }] },
    { rows: [] },
    { rows: [{ id: "summary-1", session_id: "session-1", started_at: new Date(2000), completed_at: new Date(3000), summary_text: "Summary" }] },
    { rows: [] }
  ]);

  const result = await storeTimedSummaryPostgres(client, {
    sessionId: "session-1",
    studentId: "student-1",
    startedAt: 2000,
    completedAt: 3000,
    summaryText: "Summary"
  });

  assert.equal(result.ok, true);
  assert.match(client.calls[2].sql, /insert into timed_summaries/);
  assert.equal(client.calls[2].params[4].length, 64);
  assert.match(client.calls[3].sql, /insert into comprehension_responses/);
  assert.equal(client.calls[3].params[1], "summary-1");
  assert.match(client.calls[4].sql, /status = 'summary_submitted'/);
});

test("storeTimedSummaryPostgres rejects duplicate summaries and invalid time ranges", async () => {
  const duplicateClient = createMockClient([
    { rows: [{ id: "session-1", student_id: "student-1", submitted_at: 1000, locked_at: 1000 }] },
    { rows: [{ id: "summary-1" }] }
  ]);

  const duplicate = await storeTimedSummaryPostgres(duplicateClient, {
    sessionId: "session-1",
    studentId: "student-1",
    startedAt: 2000,
    completedAt: 3000,
    summaryText: "Summary"
  });

  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.status, 409);

  const invalid = await storeTimedSummaryPostgres(createMockClient([]), {
    sessionId: "session-1",
    studentId: "student-1",
    startedAt: 3000,
    completedAt: 2000,
    summaryText: "Summary"
  });

  assert.deepEqual(invalid, {
    ok: false,
    status: 400,
    error: "Timed summary completion must be after start."
  });
});

test("getProfessorReportPostgres loads observations and replay frames for owned sessions", async () => {
  const client = createMockClient([
    { rows: [{ id: "session-1" }] },
    { rows: [
      {
        id: "event-1",
        type: "insert",
        occurred_at: new Date(1000),
        input_type: "insertText",
        start_offset: 0,
        removed: "",
        added: "Process evidence supports revision",
        removed_characters: 0,
        added_words: 4,
        removed_words: 0,
        duration_since_previous_ms: 0,
        paste_words: 0,
        deletion_event: false,
        words: null
      }
    ] },
    { rows: [
      { captured_at: new Date(0), text: "" },
      { captured_at: new Date(2000), text: "Process evidence supports revision" }
    ] },
    { rows: [{ summary_text: "Process evidence and revision were discussed." }] },
    { rows: [] },
    { rows: [{ id: "report-1" }] },
    { rows: [] }
  ]);

  const result = await getProfessorReportPostgres(client, "session-1", "professor-1");

  assert.equal(result.ok, true);
  assert.equal(result.value.submittedText, "Process evidence supports revision");
  assert.ok(result.value.observations.some((item) => item.group === "Comprehension Check"));
  assert.equal(result.value.frames.length, 2);
  assert.match(client.calls[0].sql, /join assignment_instructors/);
  assert.match(client.calls[4].sql, /select observations/);
  assert.match(client.calls[5].sql, /insert into professor_reports/);
  assert.match(client.calls[6].sql, /insert into ai_evaluation_logs/);
  assert.equal(client.calls[6].params[1], "report-1");
});

test("getProfessorReportPostgres reuses existing report observations without duplicate audit rows", async () => {
  const storedObservations = [{
    group: "Comprehension Check",
    title: "Stored summary coverage",
    detail: "Stored report observation."
  }];
  const client = createMockClient([
    { rows: [{ id: "session-1" }] },
    { rows: [
      {
        id: "event-1",
        type: "insert",
        occurred_at: new Date(1000),
        input_type: "insertText",
        start_offset: 0,
        removed: "",
        added: "Process evidence supports revision",
        removed_characters: 0,
        added_words: 4,
        removed_words: 0,
        duration_since_previous_ms: 0,
        paste_words: 0,
        deletion_event: false,
        words: null
      }
    ] },
    { rows: [
      { captured_at: new Date(0), text: "" },
      { captured_at: new Date(2000), text: "Process evidence supports revision" }
    ] },
    { rows: [{ summary_text: "Process evidence and revision were discussed." }] },
    { rows: [{ observations: storedObservations }] }
  ]);

  const result = await getProfessorReportPostgres(client, "session-1", "professor-1");

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.observations, storedObservations);
  assert.equal(result.value.frames.length, 2);
  assert.equal(client.calls.length, 5);
  assert.match(client.calls[4].sql, /select observations/);
  assert.ok(client.calls.every((call) => !/insert into professor_reports/.test(call.sql)));
  assert.ok(client.calls.every((call) => !/insert into ai_evaluation_logs/.test(call.sql)));
});

test("getProfessorReportPostgres rejects sessions outside professor ownership", async () => {
  const client = createMockClient([{ rows: [] }]);

  const result = await getProfessorReportPostgres(client, "session-1", "professor-1");

  assert.deepEqual(result, { ok: false, status: 404, error: "Report not found." });
  assert.equal(client.calls.length, 1);
});

test("resetCurrentStudentSessionPostgres creates the next immutable attempt", async () => {
  const client = createMockClient([
    { rows: [{ assignment_id: "assignment-1", next_attempt: 3 }] },
    { rows: [{ id: "session-3", attempt_number: 3 }] },
    { rows: [] }
  ]);

  const result = await resetCurrentStudentSessionPostgres(client, "student-1");

  assert.deepEqual(result, {
    ok: true,
    value: { sessionId: "session-3", assignmentId: "assignment-1", attemptNumber: 3 }
  });
  assert.match(client.calls[1].sql, /insert into writing_sessions/);
  assert.match(client.calls[1].sql, /on conflict \(assignment_id, student_id, attempt_number\) do nothing/);
  assert.match(client.calls[2].sql, /insert into writing_session_state/);
});

test("resetCurrentStudentSessionPostgres retries when another reset takes the next attempt", async () => {
  const client = createMockClient([
    { rows: [{ assignment_id: "assignment-1", next_attempt: 3 }] },
    { rows: [] },
    { rows: [{ assignment_id: "assignment-1", next_attempt: 4 }] },
    { rows: [{ id: "session-4", attempt_number: 4 }] },
    { rows: [] }
  ]);

  const result = await resetCurrentStudentSessionPostgres(client, "student-1");

  assert.deepEqual(result, {
    ok: true,
    value: { sessionId: "session-4", assignmentId: "assignment-1", attemptNumber: 4 }
  });
  assert.equal(client.calls.length, 5);
  assert.match(client.calls[1].sql, /on conflict \(assignment_id, student_id, attempt_number\) do nothing/);
  assert.match(client.calls[3].sql, /on conflict \(assignment_id, student_id, attempt_number\) do nothing/);
});

test("getCurrentStudentSessionPostgres uses conflict-safe first attempt creation", async () => {
  const client = createMockClient([
    { rows: [{ assignment_id: "assignment-1" }] },
    { rows: [] },
    { rows: [{ id: "session-1" }] },
    { rows: [] },
    { rows: [{
      assignment_id: "assignment-1",
      title: "Assignment",
      prompt: "Prompt",
      session_id: "session-1",
      student_id: "student-1",
      submitted_at: null,
      locked_at: null,
      status: "draft",
      attempt_number: 1,
      current_text: "",
      summary_text: null,
      summary_completed_at: null
    }] },
    { rows: [] },
    { rows: [] }
  ]);

  const result = await getCurrentStudentSessionPostgres(client, "student-1");

  assert.equal(result.ok, true);
  assert.equal(result.value.session.id, "session-1");
  assert.match(client.calls[2].sql, /on conflict \(assignment_id, student_id, attempt_number\) do nothing/);
});

test("getCurrentStudentSessionPostgres falls back to active attempt after first-attempt conflict", async () => {
  const client = createMockClient([
    { rows: [{ assignment_id: "assignment-1" }] },
    { rows: [] },
    { rows: [] },
    { rows: [{ id: "session-1" }] },
    { rows: [] },
    { rows: [{
      assignment_id: "assignment-1",
      title: "Assignment",
      prompt: "Prompt",
      session_id: "session-1",
      student_id: "student-1",
      submitted_at: null,
      locked_at: null,
      status: "draft",
      attempt_number: 1,
      current_text: "",
      summary_text: null,
      summary_completed_at: null
    }] },
    { rows: [] },
    { rows: [] }
  ]);

  const result = await getCurrentStudentSessionPostgres(client, "student-1");

  assert.equal(result.ok, true);
  assert.equal(result.value.session.id, "session-1");
  assert.match(client.calls[2].sql, /on conflict \(assignment_id, student_id, attempt_number\) do nothing/);
  assert.match(client.calls[3].sql, /order by attempt_number desc/);
});

test("current student session returns latest active attempt after reset", async () => {
  const client = createMockClient([
    { rows: [{ assignment_id: "assignment-1", next_attempt: 2 }] },
    { rows: [{ id: "session-2", attempt_number: 2 }] },
    { rows: [] },
    { rows: [{ assignment_id: "assignment-1" }] },
    { rows: [{ id: "session-2" }] },
    { rows: [] },
    { rows: [{
      assignment_id: "assignment-1",
      title: "Assignment",
      prompt: "Prompt",
      session_id: "session-2",
      student_id: "student-1",
      submitted_at: null,
      locked_at: null,
      status: "draft",
      attempt_number: 2,
      current_text: "",
      summary_text: null,
      summary_completed_at: null
    }] },
    { rows: [] },
    { rows: [] }
  ]);

  const reset = await resetCurrentStudentSessionPostgres(client, "student-1");
  const current = await getCurrentStudentSessionPostgres(client, "student-1");

  assert.equal(reset.ok, true);
  assert.equal(current.ok, true);
  assert.equal(current.value.session.id, "session-2");
  assert.equal(current.value.session.attemptNumber, 2);
  assert.match(client.calls[4].sql, /order by attempt_number desc/);
  assert.doesNotMatch(client.calls[4].sql, /insert into writing_sessions/);
});
