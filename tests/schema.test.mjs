import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");

test("Postgres schema includes core production tables", () => {
  [
    "app_users",
    "auth_identities",
    "password_reset_tokens",
    "assignments",
    "assignment_instructors",
    "assignment_students",
    "class_invitations",
    "writing_sessions",
    "writing_session_state",
    "writing_events",
    "submission_snapshots",
    "submissions",
    "timed_summaries",
    "comprehension_responses",
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
    "submissions_are_immutable",
    "timed_summaries_are_immutable",
    "comprehension_responses_are_immutable"
  ].forEach((trigger) => {
    assert.match(schema, new RegExp(`create trigger ${trigger}`));
  });

  assert.match(schema, /before update or delete on writing_events/);
  assert.match(schema, /before update or delete on submission_snapshots/);
  assert.match(schema, /before update or delete on submissions/);
  assert.match(schema, /before update or delete on timed_summaries/);
  assert.match(schema, /before update or delete on comprehension_responses/);
});

test("schema preserves append order and server-side submission lock fields", () => {
  assert.match(schema, /event_index integer not null/);
  assert.match(schema, /unique \(session_id, event_index\)/);
  assert.match(schema, /submitted_at timestamptz/);
  assert.match(schema, /locked_at timestamptz/);
  assert.match(schema, /status writing_session_status not null default 'draft'/);
  assert.match(schema, /attempt_number integer not null default 1/);
  assert.match(schema, /writing_sessions_attempt_unique/);
  assert.match(schema, /check \(locked_at is null or submitted_at is not null\)/);
  assert.match(schema, /submitted_snapshot_id uuid not null unique references submission_snapshots/);
  assert.match(schema, /submitted_text_sha256 text not null/);
});

test("schema separates mutable session state from immutable evidence", () => {
  assert.match(schema, /create table if not exists writing_session_state/);
  assert.match(schema, /current_text text not null default ''/);
  assert.match(schema, /last_event_index integer not null default -1/);
  assert.match(schema, /kind snapshot_kind not null default 'submitted'/);
  assert.match(schema, /submission_snapshots_session_kind_idx/);
  assert.match(schema, /timed_summary_id uuid not null unique references timed_summaries/);
  assert.match(schema, /response_text_sha256 text not null/);
  assert.match(schema, /response_items jsonb not null default '\[\]'::jsonb/);
  assert.match(schema, /timed_summaries_response_items_check/);
});

test("schema supports authenticated identity and professor assignment access", () => {
  assert.match(schema, /create table if not exists auth_identities/);
  assert.match(schema, /unique \(provider, provider_subject\)/);
  assert.match(schema, /create table if not exists auth_credentials/);
  assert.match(schema, /create table if not exists password_reset_tokens/);
  assert.match(schema, /password_hash text not null/);
  assert.match(schema, /check \(position\('scrypt\$' in password_hash\) = 1\)/);
  assert.match(schema, /create table if not exists assignment_instructors/);
  assert.match(schema, /primary key \(assignment_id, professor_id\)/);
  assert.match(schema, /kind text not null default 'assignment'/);
  assert.match(schema, /class_id uuid references assignments/);
  assert.match(schema, /join_code text/);
  assert.match(schema, /create unique index if not exists assignments_join_code_unique/);
  assert.match(schema, /create table if not exists class_invitations/);
  assert.match(schema, /token_hash text not null unique/);
});

test("schema captures AI evaluation audit metadata", () => {
  assert.match(schema, /report_id uuid references professor_reports/);
  assert.match(schema, /prompt_hash text/);
  assert.match(schema, /input_hash text/);
  assert.match(schema, /output_hash text/);
  assert.match(schema, /latency_ms integer/);
  assert.match(schema, /token_usage jsonb/);
  assert.match(schema, /ai_evaluation_logs_session_created_idx/);
});

test("schema avoids misconduct and suspicion labels", () => {
  assert.doesNotMatch(schema.toLowerCase(), /misconduct|suspicion|suspicious|ai_detection|ai detection/);
});
