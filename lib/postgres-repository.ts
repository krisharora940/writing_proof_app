import { createHash } from "node:crypto";
import type {
  AppendWritingEventRequest,
  LockSubmissionRequest,
  TimedSummaryRequest
} from "./server-boundaries";
import type { MutationResult, StoredTimedSummary } from "./server-repository";
import type { WritingEvent } from "./writing-events";

export type QueryResult<Row> = {
  rows: Row[];
  rowCount?: number | null;
};

export type QueryClient = {
  query<Row = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<Row>>;
};

type SessionRow = {
  id: string;
  student_id: string;
  submitted_at: Date | string | null;
  locked_at: Date | string | null;
};

type EventRow = {
  id: string;
  event_index: number;
};

type SnapshotIndexRow = {
  event_index?: number;
  snapshot_index: number;
};

type SummaryRow = {
  id: string;
  session_id: string;
  started_at: Date | string;
  completed_at: Date | string;
  summary_text: string;
};

export async function appendWritingEventPostgres(
  client: QueryClient,
  request: AppendWritingEventRequest
): Promise<MutationResult<{ event: WritingEvent; eventIndex: number }>> {
  const sessionResult = await lockSessionForStudent(client, request.sessionId, request.studentId);
  const session = sessionResult.rows[0];
  if (!session) return { ok: false, status: 404, error: "Writing session not found." };
  if (session.locked_at !== null) return { ok: false, status: 409, error: "Submission is locked." };

  const eventIndex = await nextIndex(client, "writing_events", "event_index", request.sessionId);
  const insertResult = await client.query<EventRow>(
    `insert into writing_events (
      session_id,
      event_index,
      type,
      occurred_at,
      input_type,
      start_offset,
      removed,
      added,
      removed_characters,
      added_words,
      removed_words,
      duration_since_previous_ms,
      paste_words,
      deletion_event,
      words
    ) values (
      $1, $2, $3, to_timestamp($4 / 1000.0), $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
    )
    returning id, event_index`,
    [
      request.sessionId,
      eventIndex,
      request.event.type,
      request.event.at,
      request.event.inputType ?? null,
      request.event.start ?? null,
      request.event.removed ?? null,
      request.event.added ?? null,
      request.event.removedCharacters ?? null,
      request.event.addedWords ?? null,
      request.event.removedWords ?? null,
      request.event.durationSincePreviousMs ?? null,
      request.event.pasteWords ?? null,
      request.event.deletionEvent ?? false,
      request.event.words ?? null
    ]
  );

  return {
    ok: true,
    value: {
      event: {
        id: insertResult.rows[0].id,
        ...request.event
      },
      eventIndex: insertResult.rows[0].event_index
    }
  };
}

export async function lockSubmissionPostgres(
  client: QueryClient,
  request: LockSubmissionRequest
): Promise<MutationResult<{ submittedAt: number; lockedAt: number; snapshotIndex: number }>> {
  const sessionResult = await lockSessionForStudent(client, request.sessionId, request.studentId);
  const session = sessionResult.rows[0];
  if (!session) return { ok: false, status: 404, error: "Writing session not found." };
  if (session.submitted_at !== null || session.locked_at !== null) {
    return { ok: false, status: 409, error: "Submission is already locked." };
  }

  const snapshotIndex = await nextIndex(client, "submission_snapshots", "snapshot_index", request.sessionId);
  await client.query(
    `insert into submission_snapshots (
      session_id,
      snapshot_index,
      captured_at,
      text,
      text_sha256
    ) values ($1, $2, to_timestamp($3 / 1000.0), $4, $5)`,
    [
      request.sessionId,
      snapshotIndex,
      request.snapshot.at,
      request.submittedText,
      sha256(request.submittedText)
    ]
  );
  await client.query(
    `update writing_sessions
     set submitted_at = to_timestamp($2 / 1000.0),
         locked_at = to_timestamp($2 / 1000.0)
     where id = $1`,
    [request.sessionId, request.snapshot.at]
  );

  return {
    ok: true,
    value: {
      submittedAt: request.snapshot.at,
      lockedAt: request.snapshot.at,
      snapshotIndex
    }
  };
}

export async function storeTimedSummaryPostgres(
  client: QueryClient,
  request: TimedSummaryRequest
): Promise<MutationResult<StoredTimedSummary>> {
  if (request.completedAt < request.startedAt) {
    return { ok: false, status: 400, error: "Timed summary completion must be after start." };
  }

  const sessionResult = await lockSessionForStudent(client, request.sessionId, request.studentId);
  const session = sessionResult.rows[0];
  if (!session) return { ok: false, status: 404, error: "Writing session not found." };
  if (session.submitted_at === null) {
    return { ok: false, status: 409, error: "Timed summary cannot be stored for this session." };
  }

  const existingSummary = await client.query<{ id: string }>(
    "select id from timed_summaries where session_id = $1",
    [request.sessionId]
  );
  if (existingSummary.rows[0]) {
    return { ok: false, status: 409, error: "Timed summary cannot be stored for this session." };
  }

  const insertResult = await client.query<SummaryRow>(
    `insert into timed_summaries (
      session_id,
      started_at,
      completed_at,
      summary_text,
      summary_text_sha256
    ) values ($1, to_timestamp($2 / 1000.0), to_timestamp($3 / 1000.0), $4, $5)
    returning id, session_id, started_at, completed_at, summary_text`,
    [
      request.sessionId,
      request.startedAt,
      request.completedAt,
      request.summaryText,
      sha256(request.summaryText)
    ]
  );

  const row = insertResult.rows[0];
  return {
    ok: true,
    value: {
      id: row.id,
      sessionId: row.session_id,
      startedAt: request.startedAt,
      completedAt: request.completedAt,
      summaryText: row.summary_text
    }
  };
}

async function lockSessionForStudent(client: QueryClient, sessionId: string, studentId: string) {
  return client.query<SessionRow>(
    `select id, student_id, submitted_at, locked_at
     from writing_sessions
     where id = $1 and student_id = $2
     for update`,
    [sessionId, studentId]
  );
}

async function nextIndex(client: QueryClient, table: "writing_events" | "submission_snapshots", column: "event_index" | "snapshot_index", sessionId: string) {
  const result = await client.query<SnapshotIndexRow>(
    `select coalesce(max(${column}), -1) + 1 as ${column}
     from ${table}
     where session_id = $1`,
    [sessionId]
  );

  return Number(result.rows[0]?.[column as keyof SnapshotIndexRow] ?? 0);
}

function sha256(text: string) {
  return createHash("sha256").update(text).digest("hex");
}
