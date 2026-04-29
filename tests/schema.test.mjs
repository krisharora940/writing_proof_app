import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");

test("Postgres schema includes core production tables", () => {
  [
    "app_users",
    "assignments",
    "assignment_students",
    "writing_sessions",
    "writing_events",
    "submission_snapshots",
    "timed_summaries",
    "professor_reports",
    "ai_evaluation_logs"
  ].forEach((table) => {
    assert.match(schema, new RegExp(`create table if not exists ${table} \\(`));
  });
});

test("writing evidence tables are immutable after insert", () => {
  [
    "writing_events_are_immutable",
    "submission_snapshots_are_immutable",
    "timed_summaries_are_immutable"
  ].forEach((trigger) => {
    assert.match(schema, new RegExp(`create trigger ${trigger}`));
  });

  assert.match(schema, /before update or delete on writing_events/);
  assert.match(schema, /before update or delete on submission_snapshots/);
  assert.match(schema, /before update or delete on timed_summaries/);
});

test("schema preserves append order and server-side submission lock fields", () => {
  assert.match(schema, /event_index integer not null/);
  assert.match(schema, /unique \(session_id, event_index\)/);
  assert.match(schema, /submitted_at timestamptz/);
  assert.match(schema, /locked_at timestamptz/);
  assert.match(schema, /check \(locked_at is null or submitted_at is not null\)/);
});

test("schema avoids misconduct and suspicion labels", () => {
  assert.doesNotMatch(schema.toLowerCase(), /misconduct|suspicion|suspicious|ai_detection|ai detection/);
});
