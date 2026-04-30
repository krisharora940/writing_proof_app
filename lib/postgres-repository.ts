import { createHash } from "node:crypto";
import type {
  AppendWritingEventRequest,
  LockSubmissionRequest,
  ProfessorReportResponse,
  TimedSummaryRequest
} from "./server-boundaries";
import type { MutationResult, StoredTimedSummary } from "./server-repository";
import type { ReplayFrame } from "./replay";
import type { Observation, Snapshot, WritingEvent } from "./writing-events";

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

type SessionStateRow = {
  current_text: string;
  last_event_index: number;
};

type ReportEventRow = {
  id: string;
  type: WritingEvent["type"];
  occurred_at: Date | string;
  input_type: string | null;
  start_offset: number | null;
  removed: string | null;
  added: string | null;
  removed_characters: number | null;
  added_words: number | null;
  removed_words: number | null;
  duration_since_previous_ms: number | null;
  paste_words: number | null;
  deletion_event: boolean;
  words: number | null;
};

type ReportSnapshotRow = {
  captured_at: Date | string;
  text: string;
};

type ReportSummaryRow = {
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

  const storedEvent = {
    id: insertResult.rows[0].id,
    ...request.event
  };
  await updateSessionStateAfterEvent(client, request.sessionId, storedEvent, insertResult.rows[0].event_index);

  return {
    ok: true,
    value: {
      event: storedEvent,
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
      text_sha256,
      kind
    ) values ($1, $2, to_timestamp($3 / 1000.0), $4, $5, 'submitted')`,
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
         locked_at = to_timestamp($2 / 1000.0),
         status = 'summary_pending',
         updated_at = now()
     where id = $1`,
    [request.sessionId, request.snapshot.at]
  );
  await upsertSessionState(client, request.sessionId, request.submittedText, null);

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
  await client.query(
    `update writing_sessions
     set status = 'summary_submitted',
         updated_at = now()
     where id = $1`,
    [request.sessionId]
  );

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

export async function getProfessorReportPostgres(
  client: QueryClient,
  sessionId: string,
  professorId: string
): Promise<MutationResult<ProfessorReportResponse>> {
  const access = await client.query<{ id: string }>(
    `select writing_sessions.id
     from writing_sessions
     join assignment_instructors on assignment_instructors.assignment_id = writing_sessions.assignment_id
     where writing_sessions.id = $1 and assignment_instructors.professor_id = $2`,
    [sessionId, professorId]
  );
  if (!access.rows[0]) return { ok: false, status: 404, error: "Report not found." };

  const eventsResult = await client.query<ReportEventRow>(
    `select
       id,
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
     from writing_events
     where session_id = $1
     order by event_index`,
    [sessionId]
  );
  const snapshotsResult = await client.query<ReportSnapshotRow>(
    `select captured_at, text
     from submission_snapshots
     where session_id = $1
     order by snapshot_index`,
    [sessionId]
  );
  const summaryResult = await client.query<ReportSummaryRow>(
    "select summary_text from timed_summaries where session_id = $1",
    [sessionId]
  );

  const events = eventsResult.rows.map(mapEventRow);
  const snapshots = snapshotsResult.rows.map(mapSnapshotRow);
  const submittedText = snapshots.at(-1)?.text || "";
  const summaryText = summaryResult.rows[0]?.summary_text || "";
  const observations = submittedText ? analyzeProcessForReport(events, submittedText) : [];
  if (submittedText && summaryText) {
    observations.push(...comparisonToReportObservations(compareSummaryForReport(submittedText, summaryText)));
  }

  return {
    ok: true,
    value: {
      observations,
      frames: reconstructReplayForReport(snapshots, events),
      submittedText,
      summaryText
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

async function updateSessionStateAfterEvent(
  client: QueryClient,
  sessionId: string,
  event: WritingEvent,
  eventIndex: number
) {
  const stateResult = await client.query<SessionStateRow>(
    "select current_text, last_event_index from writing_session_state where session_id = $1",
    [sessionId]
  );
  const currentText = stateResult.rows[0]?.current_text || "";
  const nextText = applyEventForReport(currentText, event);
  await upsertSessionState(client, sessionId, nextText, eventIndex);
}

async function upsertSessionState(
  client: QueryClient,
  sessionId: string,
  currentText: string,
  lastEventIndex: number | null
) {
  await client.query(
    `insert into writing_session_state (
       session_id,
       current_text,
       current_text_sha256,
       last_event_index,
       updated_at
     ) values ($1, $2, $3, coalesce($4, -1), now())
     on conflict (session_id) do update
     set current_text = excluded.current_text,
         current_text_sha256 = excluded.current_text_sha256,
         last_event_index = case
           when $4::integer is null then writing_session_state.last_event_index
           else excluded.last_event_index
         end,
         updated_at = now()`,
    [sessionId, currentText, sha256(currentText), lastEventIndex]
  );
  await client.query(
    `update writing_sessions
     set updated_at = now()
     where id = $1`,
    [sessionId]
  );
}

function mapEventRow(row: ReportEventRow): WritingEvent {
  return {
    id: row.id,
    type: row.type,
    at: timeToMs(row.occurred_at),
    inputType: row.input_type || undefined,
    start: row.start_offset ?? undefined,
    removed: row.removed ?? undefined,
    added: row.added ?? undefined,
    removedCharacters: row.removed_characters ?? undefined,
    addedWords: row.added_words ?? undefined,
    removedWords: row.removed_words ?? undefined,
    durationSincePreviousMs: row.duration_since_previous_ms ?? undefined,
    pasteWords: row.paste_words ?? undefined,
    deletionEvent: row.deletion_event,
    words: row.words ?? undefined
  };
}

function mapSnapshotRow(row: ReportSnapshotRow): Snapshot {
  return {
    at: timeToMs(row.captured_at),
    text: row.text
  };
}

function timeToMs(value: Date | string) {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function reconstructReplayForReport(snapshots: Snapshot[], events: WritingEvent[]) {
  const orderedSnapshots = [...snapshots].sort((a, b) => a.at - b.at);
  const orderedEvents = [...events].sort((a, b) => a.at - b.at);
  const firstSnapshot = orderedSnapshots[0] || { at: Date.now(), text: "" };
  let currentText = firstSnapshot.text;

  const frames: ReplayFrame[] = [{
    at: firstSnapshot.at,
    text: currentText,
    eventId: null,
    eventType: "start" as const,
    label: "Draft started"
  }];

  orderedEvents.forEach((event) => {
    currentText = applyEventForReport(currentText, event);
    const checkpoint = orderedSnapshots.find((snapshot) => snapshot.at === event.at);
    if (checkpoint) currentText = checkpoint.text;

    frames.push({
      at: event.at,
      text: currentText,
      eventId: event.id,
      eventType: event.type,
      label: describeEventForReport(event)
    });
  });

  return frames;
}

function applyEventForReport(currentText: string, event: WritingEvent) {
  if (event.type === "submit") return currentText;
  if (typeof event.start !== "number") return currentText;

  const removed = event.removed || "";
  const added = event.added || "";
  return `${currentText.slice(0, event.start)}${added}${currentText.slice(event.start + removed.length)}`;
}

function describeEventForReport(event: WritingEvent) {
  if (event.type === "submit") return `Submitted${event.words ? ` with ${event.words} words` : ""}`;
  if (event.type === "paste") {
    const words = event.pasteWords || event.addedWords || 0;
    return `Paste${words ? `, ${words} words inserted` : ""}`;
  }
  if (event.type === "delete") {
    const characters = event.removedCharacters || event.removed?.length || 0;
    return `Delete${characters ? `, ${characters} characters removed` : ""}`;
  }

  const words = event.addedWords || 0;
  return `Insert${words ? `, ${words} words added` : ""}`;
}

function analyzeProcessForReport(events: WritingEvent[], submittedText: string): Observation[] {
  const observations: Observation[] = [];
  const activeMs = activeWritingMsForReport(events);
  const finalWords = countWordsForReport(submittedText);
  const editEvents = events.filter((event) => ["insert", "delete", "paste"].includes(event.type));
  const deleteEvents = events.filter((event) => event.type === "delete" || (event.removedWords || 0) > 0);
  const deletionEvents = events.filter((event) => event.deletionEvent);
  const pasteEvents = events.filter((event) => event.type === "paste");

  pasteEvents.forEach((event) => {
    const words = event.pasteWords || event.addedWords || 0;
    if (words >= 200) {
      observations.push({
        group: "Major Event",
        title: "Large insertion",
        detail: `${words} words were inserted at ${new Date(event.at).toLocaleTimeString()} from a paste event.`
      });
    } else if (words >= 50) {
      observations.push({
        group: "Context Event",
        title: "Medium insertion",
        detail: `${words} words were inserted from a paste event.`
      });
    }
  });

  if (finalWords >= 200 && activeMs < 5 * 60 * 1000) {
    observations.push({
      group: "Major Event",
      title: "Low active writing time",
      detail: `${finalWords} submitted words with ${formatDurationForReport(activeMs)} of active writing input.`
    });
  }

  if (finalWords >= 150 && deleteEvents.length === 0) {
    observations.push({
      group: "Major Event",
      title: "No revision activity",
      detail: "No deletions or text-removal revisions were recorded before submission."
    });
  }

  deletionEvents.forEach((event) => {
    observations.push({
      group: "Context Event",
      title: "Deletion event",
      detail: `${event.removedCharacters || 0} characters were deleted at ${new Date(event.at).toLocaleTimeString()}.`
    });
  });

  events.forEach((event) => {
    const wordsAdded = event.addedWords || event.pasteWords || 0;
    if ((event.durationSincePreviousMs || 0) > 20 * 60 * 1000 && wordsAdded >= 75) {
      observations.push({
        group: "Context Event",
        title: "Idle gap followed by insertion",
        detail: `${formatDurationForReport(event.durationSincePreviousMs || 0)} elapsed before ${wordsAdded} words were added.`
      });
    }
  });

  if (observations.length === 0 && editEvents.length > 0) {
    observations.push({
      group: "Typical Process Indicator",
      title: "Variable drafting activity",
      detail: "The event log contains smaller writing actions across the drafting session."
    });
  }

  return observations;
}

function compareSummaryForReport(submittedText: string, summaryText: string) {
  const paperKeywords = extractKeywordsForReport(submittedText);
  const summaryKeywords = new Set(extractKeywordsForReport(summaryText));
  const covered = paperKeywords.filter((word) => summaryKeywords.has(word));
  const missing = paperKeywords.filter((word) => !summaryKeywords.has(word)).slice(0, 4);
  const observations = [{
    category: covered.length ? "covered" : "partial",
    claim: `${covered.length} of ${paperKeywords.length} key paper terms appeared in the timed summary.`,
    evidence: covered.length ? covered.slice(0, 6).join(", ") : "No repeated key terms found."
  }];

  if (missing.length) {
    observations.push({
      category: "missing",
      claim: "Some frequent paper terms did not appear in the timed summary.",
      evidence: missing.join(", ")
    });
  }

  observations.push({
    category: countWordsForReport(summaryText) >= 20 ? "covered" : "partial",
    claim: "Timed summary length was reviewed against the submitted paper.",
    evidence: `${countWordsForReport(summaryText)} summary words for ${countWordsForReport(submittedText)} submitted words.`
  });

  return { observations };
}

function comparisonToReportObservations(comparison: { observations: Array<{ category: string; claim: string; evidence: string }> }): Observation[] {
  return comparison.observations.map((item) => ({
    group: "Comprehension Check",
    title: item.category === "covered" ? "Summary coverage" : item.category === "missing" ? "Summary gap" : "Partial summary coverage",
    detail: `${item.claim} Evidence: ${item.evidence}`
  }));
}

function activeWritingMsForReport(events: WritingEvent[]) {
  return events.reduce((total, event) => {
    if (!["insert", "delete", "paste"].includes(event.type)) return total;
    return total + Math.min(event.durationSincePreviousMs || 0, 30_000);
  }, 0);
}

function countWordsForReport(text: string) {
  return (text.trim().match(/\b[\w'-]+\b/g) || []).length;
}

function formatDurationForReport(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return minutes ? `${minutes}m ${remaining}s` : `${remaining}s`;
}

function extractKeywordsForReport(text: string) {
  const stopWords = new Set([
    "about", "after", "again", "also", "because", "before", "between", "could", "every",
    "from", "have", "into", "more", "should", "that", "their", "there", "these", "they",
    "this", "through", "what", "when", "where", "which", "while", "with", "would"
  ]);

  const counts = new Map<string, number>();
  (text.toLowerCase().match(/\b[a-z][a-z'-]{3,}\b/g) || []).forEach((word) => {
    if (!stopWords.has(word)) counts.set(word, (counts.get(word) || 0) + 1);
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([word]) => word);
}
