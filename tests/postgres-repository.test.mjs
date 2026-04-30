import assert from "node:assert/strict";
import test from "node:test";

import {
  appendWritingEventPostgres,
  getProfessorReportPostgres,
  lockSubmissionPostgres,
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
  assert.equal(client.calls[2].params[4].length, 64);
  assert.match(client.calls[3].sql, /update writing_sessions/);
  assert.match(client.calls[3].sql, /status = 'summary_pending'/);
  assert.match(client.calls[4].sql, /insert into writing_session_state/);
});

test("storeTimedSummaryPostgres inserts one hashed summary after submission", async () => {
  const client = createMockClient([
    { rows: [{ id: "session-1", student_id: "student-1", submitted_at: 1000, locked_at: 1000 }] },
    { rows: [] },
    { rows: [{ id: "summary-1", session_id: "session-1", started_at: new Date(2000), completed_at: new Date(3000), summary_text: "Summary" }] }
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
  assert.match(client.calls[3].sql, /status = 'summary_submitted'/);
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
    { rows: [{ summary_text: "Process evidence and revision were discussed." }] }
  ]);

  const result = await getProfessorReportPostgres(client, "session-1", "professor-1");

  assert.equal(result.ok, true);
  assert.equal(result.value.submittedText, "Process evidence supports revision");
  assert.ok(result.value.observations.some((item) => item.group === "Comprehension Check"));
  assert.equal(result.value.frames.length, 2);
  assert.match(client.calls[0].sql, /join assignment_instructors/);
});

test("getProfessorReportPostgres rejects sessions outside professor ownership", async () => {
  const client = createMockClient([{ rows: [] }]);

  const result = await getProfessorReportPostgres(client, "session-1", "professor-1");

  assert.deepEqual(result, { ok: false, status: 404, error: "Report not found." });
  assert.equal(client.calls.length, 1);
});
