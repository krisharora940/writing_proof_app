import { createHash, randomBytes } from "node:crypto";
import type {
  AcceptClassInvitationResponse,
  AppendWritingEventRequest,
  AssignmentRosterResponse,
  AssignmentSubmissionListResponse,
  ClassInvitationLookupResponse,
  CreateProfessorAssignmentBody,
  CreateProfessorAssignmentResponse,
  CreateProfessorClassBody,
  CreateProfessorClassResponse,
  EnrollAssignmentStudentBody,
  InviteClassStudentsBody,
  InviteClassStudentsResponse,
  JoinClassByCodeResponse,
  LockSubmissionRequest,
  RemoveAssignmentStudentBody,
  ProfessorAssignmentListResponse,
  ProfessorClassListResponse,
  ProfessorReportResponse,
  ReportExportResponse,
  ReplayResponse,
  SaveProfessorGradeBody,
  SaveProfessorGradeResponse,
  SessionMetricsResponse,
  SummaryComparisonResponse,
  StudentAssignmentListResponse,
  StudentSessionResponse,
  TimedSummaryRequest
} from "./server-boundaries";
import { getAppBaseUrl, normalizeEmail, sendTransactionalEmail } from "./auth.ts";
import { evaluateSummaryComparison, writeAiEvaluationLog } from "./ai-evaluation.ts";
import {
  generateBehavioralRiskEvidenceTags,
  generateComprehensionFeatureTags,
  generateObservationEvidenceTags,
  generatePlanningSourceEvidenceTags,
  generateProcessEvidenceTags,
  generateSummaryEvidenceTags
} from "./evidence-tags.ts";
import { createReportExport, type ReportExportFormat } from "./report-export.ts";
import { compareSummaryToPaper, comparisonToObservations } from "./summary-comparison.ts";
import { buildReportProcessHighlights, type MutationResult, type StoredTimedSummary } from "./server-repository.ts";
import { buildAuthorCheckSummary } from "./authorcheck-report.ts";
import { extractProcessFeatures } from "./process-features.ts";
import { extractComprehensionFeatures } from "./comprehension-features.ts";
import { extractPlanningSourceFeatures } from "./planning-source-features.ts";
import { normalizeComprehensionCheckSettings } from "./comprehension-check.ts";
import { comprehensionAnswerText, normalizeComprehensionResponses, type ComprehensionResponseItem } from "./comprehension-response.ts";
import type { ReplayFrame } from "./replay";
import { analyzeBehavioralRisk, behavioralSignalsToObservations } from "./behavioral-risk.ts";
import { calculateSessionMetrics, type Observation, type Snapshot, type WritingEvent } from "./writing-events.ts";

export type QueryResult<Row> = {
  rows: Row[];
  rowCount?: number | null;
};

export type QueryClient = {
  query<Row = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<Row>>;
};

type TransactionClient = QueryClient & { release(): void };

type ConnectableQueryClient = QueryClient & {
  connect(): Promise<TransactionClient>;
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

type SnapshotInsertRow = {
  id: string;
  snapshot_index: number;
};

type SummaryRow = {
  id: string;
  session_id: string;
  started_at: Date | string;
  completed_at: Date | string;
  summary_text: string;
  response_items: unknown;
};

type StudentSessionRow = {
  assignment_id: string;
  title: string;
  prompt: string;
  comprehension_check_enabled: boolean;
  comprehension_check_time_limit_minutes: number;
  comprehension_check_questions: unknown;
  session_id: string;
  student_id: string;
  submitted_at: Date | string | null;
  locked_at: Date | string | null;
  status: string;
  attempt_number: number;
  current_text: string | null;
  summary_text: string | null;
  summary_completed_at: Date | string | null;
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
  response_items?: unknown;
  started_at: Date | string | null;
  completed_at: Date | string | null;
};

type ExistingReportRow = {
  observations: unknown;
};

type AssignmentRow = {
  id: string;
  title: string;
  prompt: string;
  class_id: string | null;
  join_code: string | null;
  comprehension_check_enabled: boolean;
  comprehension_check_time_limit_minutes: number;
  comprehension_check_questions: unknown;
  due_at: Date | string | null;
  created_at: Date | string;
};

type ProfessorClassRow = {
  id: string;
  name: string;
  join_code: string | null;
  student_count: number;
  created_at: Date | string;
};

type ActiveAssignmentRow = {
  assignment_id: string;
};

type SubmissionListRow = {
  session_id: string | null;
  student_id: string;
  student_name: string;
  student_email: string;
  status: string;
  submitted_at: Date | string | null;
  locked_at: Date | string | null;
  attempt_number: number | null;
  grade_percent: number | null;
  graded_at: Date | string | null;
};

type RosterRow = {
  student_id: string;
  student_name: string;
  student_email: string;
  enrolled_at: Date | string;
};

type ClassInvitationRow = {
  id: string;
  email: string;
  created_at: Date | string;
  expires_at: Date | string;
  accepted_at: Date | string | null;
  assignment_id?: string;
  class_name?: string;
  join_code?: string | null;
};

type StudentAssignmentRow = {
  assignment_id: string;
  title: string;
  prompt: string;
  class_id: string | null;
  class_name: string | null;
  comprehension_check_enabled: boolean;
  comprehension_check_time_limit_minutes: number;
  comprehension_check_questions: unknown;
  due_at: Date | string | null;
  enrolled_at: Date | string;
  session_id: string | null;
  status: string;
  submitted_at: Date | string | null;
  locked_at: Date | string | null;
  attempt_number: number | null;
};

type StudentClassRow = {
  class_id: string;
  class_name: string;
  joined_at: Date | string;
  assignment_count: number;
  submitted_count: number;
};


export async function listStudentAssignmentsPostgres(
  client: QueryClient,
  studentId: string
): Promise<MutationResult<StudentAssignmentListResponse>> {
  const classesResult = await client.query<StudentClassRow>(
    `select
       classes.id as class_id,
       classes.title as class_name,
       class_membership.created_at as joined_at,
       count(assignments.id)::int as assignment_count,
       count(writing_sessions.id)::int filter (where writing_sessions.submitted_at is not null)::int as submitted_count
     from assignment_students as class_membership
     join assignments as classes on classes.id = class_membership.assignment_id
     left join assignments on assignments.class_id = classes.id and assignments.kind = 'assignment'
     left join writing_sessions on writing_sessions.assignment_id = assignments.id
       and writing_sessions.student_id = class_membership.student_id
       and writing_sessions.status <> 'archived'
     where class_membership.student_id = $1
       and classes.kind = 'class'
     group by classes.id, classes.title, class_membership.created_at
     order by classes.created_at desc`,
    [studentId]
  );

  const result = await client.query<StudentAssignmentRow>(
    `select
       assignments.id as assignment_id,
       assignments.title,
       assignments.prompt,
       assignments.class_id,
       class_assignments.title as class_name,
       assignments.comprehension_check_enabled,
       assignments.comprehension_check_time_limit_minutes,
       assignments.comprehension_check_questions,
       assignments.due_at,
       assignment_students.created_at as enrolled_at,
       latest_session.id as session_id,
       coalesce(latest_session.status::text, 'not_started') as status,
       latest_session.submitted_at,
       latest_session.locked_at,
       latest_session.attempt_number
     from assignment_students
     join assignments on assignments.id = assignment_students.assignment_id
     left join assignments as class_assignments on class_assignments.id = assignments.class_id
     left join lateral (
       select id, status, submitted_at, locked_at, attempt_number
       from writing_sessions
       where writing_sessions.assignment_id = assignment_students.assignment_id
         and writing_sessions.student_id = assignment_students.student_id
         and writing_sessions.status <> 'archived'
       order by attempt_number desc
       limit 1
     ) latest_session on true
     where assignment_students.student_id = $1
       and assignments.kind = 'assignment'
     order by assignments.due_at nulls last, assignments.created_at desc`,
    [studentId]
  );

  return {
    ok: true,
    value: {
      classes: classesResult.rows.map((row) => ({
        id: row.class_id,
        name: row.class_name,
        joinedAt: timeToMs(row.joined_at),
        assignmentCount: Number(row.assignment_count),
        submittedCount: Number(row.submitted_count)
      })),
      assignments: result.rows.map((row) => ({
        id: row.assignment_id,
        title: row.title,
        prompt: row.prompt,
        classId: row.class_id ?? null,
        className: row.class_name ?? null,
        dueAt: nullableTimeToMs(row.due_at),
        enrolledAt: timeToMs(row.enrolled_at),
        sessionId: row.session_id,
        status: row.status,
        submittedAt: nullableTimeToMs(row.submitted_at),
        lockedAt: nullableTimeToMs(row.locked_at),
        attemptNumber: row.attempt_number,
        comprehensionCheck: normalizeComprehensionCheckSettings({
          enabled: row.comprehension_check_enabled,
          timeLimitMinutes: row.comprehension_check_time_limit_minutes,
          questions: parseComprehensionQuestions(row.comprehension_check_questions)
        })
      }))
    }
  };
}

export async function getCurrentStudentSessionPostgres(
  client: QueryClient,
  studentId: string,
  assignmentId?: string
): Promise<MutationResult<StudentSessionResponse>> {
  const assignmentResult = await client.query<ActiveAssignmentRow>(
    `select assignment_id
     from assignment_students
     join assignments on assignments.id = assignment_students.assignment_id
     where assignment_students.student_id = $1
       and ($2::uuid is null or assignment_students.assignment_id = $2::uuid)
       and assignments.kind = 'assignment'
     order by assignments.created_at desc
     limit 1`,
    [studentId, assignmentId ?? null]
  );
  const selectedAssignmentId = assignmentResult.rows[0]?.assignment_id;
  if (!selectedAssignmentId) return { ok: false, status: 404, error: "No assignment found for this student." };

  const existingSessionResult = await client.query<{ id: string }>(
    `select id
     from writing_sessions
     where assignment_id = $1
       and student_id = $2
       and status <> 'archived'
     order by attempt_number desc
     limit 1`,
    [selectedAssignmentId, studentId]
  );
  const sessionId = existingSessionResult.rows[0]?.id || await createFirstAttemptPostgres(client, selectedAssignmentId, studentId);
  await ensureSessionState(client, sessionId);

  const detailResult = await client.query<StudentSessionRow>(
    `select
       assignments.id as assignment_id,
       assignments.title,
       assignments.prompt,
       assignments.comprehension_check_enabled,
       assignments.comprehension_check_time_limit_minutes,
       assignments.comprehension_check_questions,
       writing_sessions.id as session_id,
       writing_sessions.student_id,
       writing_sessions.submitted_at,
       writing_sessions.locked_at,
       writing_sessions.status,
       writing_sessions.attempt_number,
       writing_session_state.current_text,
       timed_summaries.summary_text,
       timed_summaries.completed_at as summary_completed_at
     from writing_sessions
     join assignments on assignments.id = writing_sessions.assignment_id
     left join writing_session_state on writing_session_state.session_id = writing_sessions.id
     left join timed_summaries on timed_summaries.session_id = writing_sessions.id
     where writing_sessions.id = $1 and writing_sessions.student_id = $2`,
    [sessionId, studentId]
  );
  const row = detailResult.rows[0];
  if (!row) return { ok: false, status: 404, error: "Writing session not found." };

  const eventsResult = await client.query<ReportEventRow>(
    `select id, type, occurred_at, input_type, start_offset, removed, added, removed_characters,
            added_words, removed_words, duration_since_previous_ms, paste_words, deletion_event, words
     from writing_events
     where session_id = $1
     order by event_index`,
    [row.session_id]
  );
  const snapshotsResult = await client.query<ReportSnapshotRow>(
    `select captured_at, text
     from submission_snapshots
     where session_id = $1
     order by snapshot_index`,
    [row.session_id]
  );
  const snapshots = snapshotsResult.rows.map(mapSnapshotRow);
  const submittedText = row.locked_at ? snapshots.at(-1)?.text || "" : "";

  return {
    ok: true,
    value: {
      assignment: {
        id: row.assignment_id,
        title: row.title,
        prompt: row.prompt,
        comprehensionCheck: normalizeComprehensionCheckSettings({
          enabled: row.comprehension_check_enabled,
          timeLimitMinutes: row.comprehension_check_time_limit_minutes,
          questions: parseComprehensionQuestions(row.comprehension_check_questions)
        })
      },
      session: {
        id: row.session_id,
        assignmentId: row.assignment_id,
        studentId: row.student_id,
        submittedAt: nullableTimeToMs(row.submitted_at),
        lockedAt: nullableTimeToMs(row.locked_at),
        status: row.status,
        attemptNumber: row.attempt_number
      },
      paperText: row.current_text || "",
      submittedText,
      summaryText: row.summary_text || "",
      summaryCompletedAt: nullableTimeToMs(row.summary_completed_at),
      events: eventsResult.rows.map(mapEventRow),
      snapshots
    }
  };
}

export async function listProfessorAssignmentsPostgres(
  client: QueryClient,
  professorId: string
): Promise<MutationResult<ProfessorAssignmentListResponse>> {
  const result = await client.query<AssignmentRow>(
    `select
       assignments.id,
       assignments.title,
       assignments.prompt,
       assignments.class_id,
       assignments.comprehension_check_enabled,
       assignments.comprehension_check_time_limit_minutes,
       assignments.comprehension_check_questions,
       assignments.due_at,
       assignments.created_at
     from assignments
     join assignment_instructors on assignment_instructors.assignment_id = assignments.id
     where assignment_instructors.professor_id = $1
       and assignments.kind = 'assignment'
     order by assignments.created_at desc`,
    [professorId]
  );

  return {
    ok: true,
    value: {
      assignments: result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        prompt: row.prompt,
        classId: row.class_id ?? null,
        comprehensionCheck: normalizeComprehensionCheckSettings({
          enabled: row.comprehension_check_enabled,
          timeLimitMinutes: row.comprehension_check_time_limit_minutes,
          questions: parseComprehensionQuestions(row.comprehension_check_questions)
        }),
        dueAt: nullableTimeToMs(row.due_at),
        createdAt: timeToMs(row.created_at)
      }))
    }
  };
}

export async function createProfessorAssignmentPostgres(
  client: QueryClient,
  professorId: string,
  body: CreateProfessorAssignmentBody
): Promise<MutationResult<CreateProfessorAssignmentResponse>> {
  const title = body.title.trim();
  const prompt = body.prompt.trim();
  const comprehensionCheck = normalizeComprehensionCheckSettings(body.comprehensionCheck);
  if (!title || !prompt) return { ok: false, status: 400, error: "Assignment title and prompt are required." };
  if (body.dueAt !== null && body.dueAt !== undefined && !Number.isFinite(body.dueAt)) {
    return { ok: false, status: 400, error: "Due date is invalid." };
  }

  await client.query("begin");
  try {
    if (body.classId) {
      const access = await requireProfessorClassAccess(client, body.classId, professorId);
      if (!access.ok) {
        await client.query("rollback");
        return access;
      }
    }

    const assignmentResult = await client.query<AssignmentRow>(
      `insert into assignments (
         professor_id, title, prompt, kind, class_id,
         comprehension_check_enabled, comprehension_check_time_limit_minutes, comprehension_check_questions, due_at
       )
       values ($1, $2, $3, 'assignment', $4, $5, $6, $7::jsonb, case when $8::double precision is null then null else to_timestamp($8 / 1000.0) end)
       returning
         id, title, prompt, class_id,
         comprehension_check_enabled, comprehension_check_time_limit_minutes, comprehension_check_questions,
         due_at, created_at`,
      [
        professorId,
        title,
        prompt,
        body.classId ?? null,
        comprehensionCheck.enabled,
        comprehensionCheck.timeLimitMinutes,
        JSON.stringify(comprehensionCheck.questions),
        body.dueAt ?? null
      ]
    );
    const assignment = assignmentResult.rows[0];
    await client.query(
      `insert into assignment_instructors (assignment_id, professor_id, role)
       values ($1, $2, 'owner')
       on conflict (assignment_id, professor_id) do nothing`,
      [assignment.id, professorId]
    );
    if (body.classId) {
      await client.query(
        `insert into assignment_students (assignment_id, student_id)
         select $1, student_id
         from assignment_students
         where assignment_id = $2
         on conflict (assignment_id, student_id) do nothing`,
        [assignment.id, body.classId]
      );
    }
    await client.query("commit");

    return {
      ok: true,
      value: {
        assignment: {
          id: assignment.id,
          title: assignment.title,
          prompt: assignment.prompt,
          classId: assignment.class_id ?? null,
          comprehensionCheck: normalizeComprehensionCheckSettings({
            enabled: assignment.comprehension_check_enabled,
            timeLimitMinutes: assignment.comprehension_check_time_limit_minutes,
            questions: parseComprehensionQuestions(assignment.comprehension_check_questions)
          }),
          dueAt: nullableTimeToMs(assignment.due_at),
          createdAt: timeToMs(assignment.created_at)
        }
      }
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

export async function listProfessorClassesPostgres(
  client: QueryClient,
  professorId: string
): Promise<MutationResult<ProfessorClassListResponse>> {
  const result = await client.query<ProfessorClassRow>(
    `select
       assignments.id,
       assignments.title as name,
       assignments.join_code,
       assignments.created_at,
       count(assignment_students.student_id)::int as student_count
     from assignments
     join assignment_instructors on assignment_instructors.assignment_id = assignments.id
     left join assignment_students on assignment_students.assignment_id = assignments.id
     where assignment_instructors.professor_id = $1
       and assignments.kind = 'class'
     group by assignments.id, assignments.title, assignments.created_at
     order by assignments.created_at desc`,
    [professorId]
  );

  const classes = await Promise.all(result.rows.map(async (row) => {
    const joinCode = row.join_code || await assignClassJoinCodePostgres(client, row.id);
    return {
      id: row.id,
      name: row.name,
      joinCode,
      studentCount: Number(row.student_count),
      createdAt: timeToMs(row.created_at)
    };
  }));

  return {
    ok: true,
    value: {
      classes
    }
  };
}

export async function createProfessorClassPostgres(
  client: QueryClient,
  professorId: string,
  body: CreateProfessorClassBody
): Promise<MutationResult<CreateProfessorClassResponse>> {
  const name = body.name.trim();
  if (!name) return { ok: false, status: 400, error: "Class name is required." };
  const joinCode = createClassJoinCode();

  await client.query("begin");
  try {
    const classResult = await client.query<AssignmentRow>(
      `insert into assignments (professor_id, title, prompt, kind, join_code)
       values ($1, $2, $3, 'class', $4)
       returning id, title, prompt, class_id, join_code, due_at, created_at`,
      [professorId, name, `Class workspace for ${name}.`, joinCode]
    );
    const classroom = classResult.rows[0];
    await client.query(
      `insert into assignment_instructors (assignment_id, professor_id, role)
       values ($1, $2, 'owner')
       on conflict (assignment_id, professor_id) do nothing`,
      [classroom.id, professorId]
    );
    await client.query("commit");

    return {
      ok: true,
      value: {
        class: {
          id: classroom.id,
          name: classroom.title,
          joinCode: classroom.join_code || joinCode,
          studentCount: 0,
          createdAt: timeToMs(classroom.created_at)
        }
      }
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

export async function listAssignmentRosterPostgres(
  client: QueryClient,
  assignmentId: string,
  professorId: string
): Promise<MutationResult<AssignmentRosterResponse>> {
  const access = await requireProfessorAssignmentAccess(client, assignmentId, professorId);
  if (!access.ok) return access;

  const result = await client.query<RosterRow>(
    `select
       app_users.id as student_id,
       app_users.display_name as student_name,
       app_users.email as student_email,
       assignment_students.created_at as enrolled_at
     from assignment_students
     join app_users on app_users.id = assignment_students.student_id
     where assignment_students.assignment_id = $1
     order by app_users.display_name, app_users.email`,
    [assignmentId]
  );
  const invitationResult = await client.query<ClassInvitationRow>(
    `select id, email, created_at, expires_at, accepted_at
     from class_invitations
     where assignment_id = $1
       and accepted_at is null
       and expires_at > now()
     order by created_at desc`,
    [assignmentId]
  );

  return {
    ok: true,
    value: {
      students: result.rows.map((row) => ({
        studentId: row.student_id,
        studentName: row.student_name,
        studentEmail: row.student_email,
        enrolledAt: timeToMs(row.enrolled_at)
      })),
      pendingInvitations: invitationResult.rows.map((row) => ({
        invitationId: row.id,
        email: row.email,
        createdAt: timeToMs(row.created_at),
        expiresAt: timeToMs(row.expires_at)
      }))
    }
  };
}

export async function inviteClassStudentsPostgres(
  client: QueryClient,
  classId: string,
  professorId: string,
  body: InviteClassStudentsBody
): Promise<MutationResult<InviteClassStudentsResponse>> {
  const emails = [...new Set(body.emails.map((email) => normalizeEmail(email)).filter(Boolean))];
  if (!emails.length) return { ok: false, status: 400, error: "At least one valid email is required." };

  await client.query("begin");
  try {
    const access = await requireProfessorClassAccess(client, classId, professorId);
    if (!access.ok) {
      await client.query("rollback");
      return access;
    }

    const classResult = await client.query<{ title: string; join_code: string | null }>(
      `select title, join_code
       from assignments
       where id = $1
       for update`,
      [classId]
    );
    const classroom = classResult.rows[0];
    if (!classroom) {
      await client.query("rollback");
      return { ok: false, status: 404, error: "Class not found." };
    }

    const joinCode = classroom.join_code || await assignClassJoinCodePostgres(client, classId);
    const enrolledResult = await client.query<{ email: string }>(
      `select app_users.email
       from assignment_students
       join app_users on app_users.id = assignment_students.student_id
       where assignment_students.assignment_id = $1
         and app_users.email = any($2::text[])`,
      [classId, emails]
    );
    const enrolledEmails = new Set(enrolledResult.rows.map((row) => row.email));
    const inviteTargets = emails.filter((email) => !enrolledEmails.has(email));
    if (!inviteTargets.length) {
      await client.query("rollback");
      return { ok: false, status: 409, error: "All listed students are already in this class." };
    }

    const invitations: InviteClassStudentsResponse["invitations"] = [];
    for (const email of inviteTargets) {
      await client.query(
        `delete from class_invitations
         where assignment_id = $1
           and email = $2
           and accepted_at is null`,
        [classId, email]
      );

      const token = createInvitationToken();
      const inserted = await client.query<ClassInvitationRow>(
        `insert into class_invitations (assignment_id, invited_by, email, token_hash, expires_at)
         values ($1, $2, $3, $4, now() + interval '7 days')
         returning id, email, created_at, expires_at`,
        [classId, professorId, email, hashInvitationToken(token)]
      );
      const invitation = inserted.rows[0];
      const inviteUrl = `${getAppBaseUrl()}/invite/${token}`;
      const sendResult = await sendTransactionalEmail({
        to: email,
        subject: `You're invited to join ${classroom.title} on DraftProof`,
        text: `You've been invited to join ${classroom.title} on DraftProof. Accept here: ${inviteUrl}. You can also join directly with code ${joinCode}. This link expires in 7 days.`,
        html: `<p>You've been invited to join <strong>${classroom.title}</strong> on DraftProof.</p><p><a href="${inviteUrl}">Accept your invitation</a></p><p>Or join directly with class code <strong>${joinCode}</strong>.</p><p>This invitation expires in 7 days.</p>`
      });
      if (!sendResult.ok) {
        await client.query("rollback");
        return { ok: false, status: sendResult.status, error: "Unable to send class invitation email." };
      }

      invitations.push({
        invitationId: invitation.id,
        email: invitation.email,
        createdAt: timeToMs(invitation.created_at),
        expiresAt: timeToMs(invitation.expires_at)
      });
    }

    await client.query("commit");
    return { ok: true, value: { invitations } };
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

export async function getClassInvitationByTokenPostgres(
  client: QueryClient,
  token: string
): Promise<MutationResult<ClassInvitationLookupResponse>> {
  const result = await client.query<ClassInvitationRow>(
    `select
       class_invitations.id,
       class_invitations.assignment_id,
       class_invitations.email,
       class_invitations.created_at,
       class_invitations.expires_at,
       class_invitations.accepted_at,
       assignments.title as class_name
     from class_invitations
     join assignments on assignments.id = class_invitations.assignment_id
     where class_invitations.token_hash = $1`,
    [hashInvitationToken(token)]
  );
  const invitation = result.rows[0];
  if (!invitation) return { ok: false, status: 404, error: "Invitation not found." };
  if (new Date(invitation.expires_at).getTime() <= Date.now()) {
    return { ok: false, status: 410, error: "Invitation expired." };
  }

  return {
    ok: true,
    value: {
      invitation: {
        invitationId: invitation.id,
        classId: invitation.assignment_id as string,
        className: invitation.class_name as string,
        email: invitation.email,
        expiresAt: timeToMs(invitation.expires_at),
        acceptedAt: nullableTimeToMs(invitation.accepted_at)
      }
    }
  };
}

export async function acceptClassInvitationPostgres(
  client: QueryClient,
  token: string,
  userId: string
): Promise<MutationResult<AcceptClassInvitationResponse>> {
  await client.query("begin");
  try {
    const invitationResult = await client.query<ClassInvitationRow>(
      `select
         class_invitations.id,
         class_invitations.assignment_id,
         class_invitations.email,
         class_invitations.expires_at,
         class_invitations.accepted_at,
         assignments.title as class_name,
         assignments.join_code
       from class_invitations
       join assignments on assignments.id = class_invitations.assignment_id
       where class_invitations.token_hash = $1
       for update`,
      [hashInvitationToken(token)]
    );
    const invitation = invitationResult.rows[0];
    if (!invitation) {
      await client.query("rollback");
      return { ok: false, status: 404, error: "Invitation not found." };
    }
    if (invitation.accepted_at) {
      await client.query("rollback");
      return { ok: false, status: 409, error: "Invitation already accepted." };
    }
    if (new Date(invitation.expires_at).getTime() <= Date.now()) {
      await client.query("rollback");
      return { ok: false, status: 410, error: "Invitation expired." };
    }

    const userResult = await client.query<{ id: string; email: string; display_name: string; role: string }>(
      `select id, email, display_name, role
       from app_users
       where id = $1
       for update`,
      [userId]
    );
    const user = userResult.rows[0];
    if (!user || user.role !== "student") {
      await client.query("rollback");
      return { ok: false, status: 403, error: "Only students can accept class invitations." };
    }
    if (user.email !== invitation.email) {
      await client.query("rollback");
      return { ok: false, status: 403, error: "This invitation is for a different email address." };
    }

    const joinCode = invitation.join_code || await assignClassJoinCodePostgres(client, invitation.assignment_id as string);
    const enrolledCount = await enrollStudentInClassHierarchyPostgres(client, invitation.assignment_id as string, user.id);
    await client.query(
      `update class_invitations
       set accepted_at = now()
       where id = $1`,
      [invitation.id]
    );
    await client.query("commit");

    return {
      ok: true,
      value: {
        class: {
          id: invitation.assignment_id as string,
          name: invitation.class_name as string,
          joinCode,
          studentCount: 0,
          createdAt: Date.now()
        },
        assignmentsAdded: Math.max(enrolledCount - 1, 0)
      }
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

export async function joinClassByCodePostgres(
  client: QueryClient,
  studentId: string,
  codeInput: string
): Promise<MutationResult<JoinClassByCodeResponse>> {
  const code = normalizeClassJoinCode(codeInput);
  if (!code) return { ok: false, status: 400, error: "Class code is required." };

  await client.query("begin");
  try {
    const classResult = await client.query<ProfessorClassRow>(
      `select assignments.id, assignments.title as name, assignments.join_code, assignments.created_at
       from assignments
       where assignments.kind = 'class'
         and assignments.join_code = $1
       for update`,
      [code]
    );
    const classroom = classResult.rows[0];
    if (!classroom) {
      await client.query("rollback");
      return { ok: false, status: 404, error: "Class code not found." };
    }

    const enrolledCount = await enrollStudentInClassHierarchyPostgres(client, classroom.id, studentId);
    await client.query("commit");
    return {
      ok: true,
      value: {
        class: {
          id: classroom.id,
          name: classroom.name,
          joinCode: classroom.join_code || code,
          studentCount: 0,
          createdAt: timeToMs(classroom.created_at)
        },
        assignmentsAdded: Math.max(enrolledCount - 1, 0)
      }
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

export async function removeClassStudentPostgres(
  client: QueryClient,
  classId: string,
  professorId: string,
  body: RemoveAssignmentStudentBody
): Promise<MutationResult<{ studentId: string }>> {
  if (!body.studentId) return { ok: false, status: 400, error: "Student id is required." };
  const access = await requireProfessorClassAccess(client, classId, professorId);
  if (!access.ok) return access;

  const result = await client.query<{ student_id: string }>(
    `delete from assignment_students
     where student_id = $2
       and assignment_id in (
         select id
         from assignments
         where id = $1 or class_id = $1
       )
     returning student_id`,
    [classId, body.studentId]
  );
  const removed = result.rows[0];
  if (!removed) return { ok: false, status: 404, error: "Student enrollment not found." };
  return { ok: true, value: { studentId: removed.student_id } };
}

export async function enrollAssignmentStudentPostgres(
  client: QueryClient,
  assignmentId: string,
  professorId: string,
  body: EnrollAssignmentStudentBody
): Promise<MutationResult<AssignmentRosterResponse["students"][number]>> {
  const email = body.email.trim().toLowerCase();
  const displayName = body.displayName.trim();
  if (!email || !displayName) return { ok: false, status: 400, error: "Student name and email are required." };
  if (!email.includes("@")) return { ok: false, status: 400, error: "Student email is invalid." };

  await client.query("begin");
  try {
    const access = await requireProfessorAssignmentAccess(client, assignmentId, professorId);
    if (!access.ok) {
      await client.query("rollback");
      return access;
    }

    const existingUserResult = await client.query<{ id: string; role: string; display_name: string; email: string }>(
      "select id, role, display_name, email from app_users where email = $1 for update",
      [email]
    );
    let student = existingUserResult.rows[0];
    if (student && student.role !== "student") {
      await client.query("rollback");
      return { ok: false, status: 409, error: "Only student accounts can be enrolled." };
    }

    if (!student) {
      const insertUserResult = await client.query<{ id: string; display_name: string; email: string }>(
        `insert into app_users (email, display_name, role)
         values ($1, $2, 'student')
         returning id, display_name, email`,
        [email, displayName]
      );
      student = { ...insertUserResult.rows[0], role: "student" };
    }

    const enrollmentResult = await client.query<{ created_at: Date | string }>(
      `insert into assignment_students (assignment_id, student_id)
       values ($1, $2)
       on conflict (assignment_id, student_id) do nothing
       returning created_at`,
      [assignmentId, student.id]
    );
    const enrollment = enrollmentResult.rows[0];
    if (!enrollment) {
      await client.query("rollback");
      return { ok: false, status: 409, error: "Student is already enrolled." };
    }

    await client.query("commit");
    return {
      ok: true,
      value: {
        studentId: student.id,
        studentName: student.display_name,
        studentEmail: student.email,
        enrolledAt: timeToMs(enrollment.created_at)
      }
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

export async function removeAssignmentStudentPostgres(
  client: QueryClient,
  assignmentId: string,
  professorId: string,
  body: RemoveAssignmentStudentBody
): Promise<MutationResult<{ studentId: string }>> {
  if (!body.studentId) return { ok: false, status: 400, error: "Student id is required." };
  const access = await requireProfessorAssignmentAccess(client, assignmentId, professorId);
  if (!access.ok) return access;

  const result = await client.query<{ student_id: string }>(
    `delete from assignment_students
     where assignment_id = $1 and student_id = $2
     returning student_id`,
    [assignmentId, body.studentId]
  );
  const removed = result.rows[0];
  if (!removed) return { ok: false, status: 404, error: "Student enrollment not found." };
  return { ok: true, value: { studentId: removed.student_id } };
}

export async function listAssignmentSubmissionsPostgres(
  client: QueryClient,
  assignmentId: string,
  professorId: string
): Promise<MutationResult<AssignmentSubmissionListResponse>> {
  const access = await requireProfessorAssignmentAccess(client, assignmentId, professorId);
  if (!access.ok) return access;

  const result = await client.query<SubmissionListRow>(
    `select
       latest_session.id as session_id,
       app_users.id as student_id,
       app_users.display_name as student_name,
       app_users.email as student_email,
       coalesce(latest_session.status::text, 'not_started') as status,
       latest_session.submitted_at,
       latest_session.locked_at,
       latest_session.attempt_number,
       professor_grades.grade_percent,
       professor_grades.graded_at
     from assignment_students
     join app_users on app_users.id = assignment_students.student_id
     left join lateral (
       select id, status, submitted_at, locked_at, attempt_number
       from writing_sessions
       where writing_sessions.assignment_id = assignment_students.assignment_id
         and writing_sessions.student_id = assignment_students.student_id
         and writing_sessions.status <> 'archived'
       order by attempt_number desc
       limit 1
     ) latest_session on true
     left join professor_grades
       on professor_grades.session_id = latest_session.id
      and professor_grades.professor_id = $2
     where assignment_students.assignment_id = $1
     order by app_users.display_name, app_users.email`,
    [assignmentId, professorId]
  );

  return {
    ok: true,
    value: {
      submissions: result.rows.map((row) => ({
        sessionId: row.session_id,
        studentId: row.student_id,
        studentName: row.student_name,
        studentEmail: row.student_email,
        status: row.status,
        submittedAt: nullableTimeToMs(row.submitted_at),
        lockedAt: nullableTimeToMs(row.locked_at),
        attemptNumber: row.attempt_number,
        gradePercent: row.grade_percent,
        gradedAt: nullableTimeToMs(row.graded_at)
      }))
    }
  };
}

export async function appendWritingEventPostgres(
  client: QueryClient,
  request: AppendWritingEventRequest
): Promise<MutationResult<{ event: WritingEvent; eventIndex: number }>> {
  return withTransaction(client, (tx) => appendWritingEventPostgresInTransaction(tx, request));
}

async function appendWritingEventPostgresInTransaction(
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
  return withTransaction(client, (tx) => lockSubmissionPostgresInTransaction(tx, request));
}

async function lockSubmissionPostgresInTransaction(
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
  const snapshotResult = await client.query<SnapshotInsertRow>(
    `insert into submission_snapshots (
      session_id,
      snapshot_index,
      captured_at,
      text,
      text_sha256,
      kind
    ) values ($1, $2, to_timestamp($3 / 1000.0), $4, $5, 'submitted')
    returning id, snapshot_index`,
    [
      request.sessionId,
      snapshotIndex,
      request.snapshot.at,
      request.submittedText,
      sha256(request.submittedText)
    ]
  );
  const snapshot = snapshotResult.rows[0];
  await client.query(
    `update writing_sessions
     set submitted_at = to_timestamp($2 / 1000.0),
         locked_at = to_timestamp($2 / 1000.0),
         status = 'summary_pending',
         updated_at = now()
     where id = $1`,
    [request.sessionId, request.snapshot.at]
  );
  await client.query(
    `insert into submissions (
       session_id,
       assignment_id,
       student_id,
       submitted_snapshot_id,
       submitted_at,
       submitted_text_sha256
     )
     select id, assignment_id, student_id, $2, to_timestamp($3 / 1000.0), $4
     from writing_sessions
     where id = $1
     on conflict (session_id) do nothing`,
    [request.sessionId, snapshot.id, request.snapshot.at, sha256(request.submittedText)]
  );
  await upsertSessionState(client, request.sessionId, request.submittedText, null);

  return {
    ok: true,
    value: {
      submittedAt: request.snapshot.at,
      lockedAt: request.snapshot.at,
      snapshotIndex: snapshot.snapshot_index
    }
  };
}

export async function storeTimedSummaryPostgres(
  client: QueryClient,
  request: TimedSummaryRequest
): Promise<MutationResult<StoredTimedSummary>> {
  return withTransaction(client, (tx) => storeTimedSummaryPostgresInTransaction(tx, request));
}

async function storeTimedSummaryPostgresInTransaction(
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
  const responses = normalizeComprehensionResponses(request.responses);
  const summaryText = comprehensionAnswerText(responses, request.summaryText);

  const insertResult = await client.query<SummaryRow>(
    `insert into timed_summaries (
      session_id,
      started_at,
      completed_at,
      summary_text,
      response_items,
      summary_text_sha256
    ) values ($1, to_timestamp($2 / 1000.0), to_timestamp($3 / 1000.0), $4, $5::jsonb, $6)
    returning id, session_id, started_at, completed_at, summary_text, response_items`,
    [
      request.sessionId,
      request.startedAt,
      request.completedAt,
      summaryText,
      JSON.stringify(responses),
      sha256(summaryText)
    ]
  );

  const row = insertResult.rows[0];
  await client.query(
    `insert into comprehension_responses (
       session_id,
       timed_summary_id,
       started_at,
       completed_at,
       response_text_sha256
     ) values ($1, $2, to_timestamp($3 / 1000.0), to_timestamp($4 / 1000.0), $5)
     on conflict (session_id) do nothing`,
    [
      request.sessionId,
      row.id,
      request.startedAt,
      request.completedAt,
      sha256(responses.length ? JSON.stringify(responses) : summaryText)
    ]
  );
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
      summaryText: row.summary_text,
      responses: normalizeComprehensionResponses(row.response_items)
    }
  };
}

export async function getReplayPostgres(
  client: QueryClient,
  sessionId: string,
  user: { id: string; role: "student" | "professor" }
): Promise<MutationResult<ReplayResponse>> {
  const access = await getSessionAccessPostgres(client, sessionId, user);
  if (!access) return { ok: false, status: 404, error: "Replay not found." };

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

  return {
    ok: true,
    value: {
      frames: reconstructReplayForReport(snapshotsResult.rows.map(mapSnapshotRow), eventsResult.rows.map(mapEventRow))
    }
  };
}

export async function getSessionMetricsPostgres(
  client: QueryClient,
  sessionId: string,
  user: { id: string; role: "student" | "professor" }
): Promise<MutationResult<SessionMetricsResponse>> {
  const access = await getSessionAccessPostgres(client, sessionId, user);
  if (!access) return { ok: false, status: 404, error: "Session metrics not found." };

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
  const textResult = await client.query<{ current_text: string }>(
    "select current_text from writing_session_state where session_id = $1",
    [sessionId]
  );

  return {
    ok: true,
    value: {
      metrics: calculateSessionMetrics(eventsResult.rows.map(mapEventRow), textResult.rows[0]?.current_text || "")
    }
  };
}

export async function getSummaryComparisonPostgres(
  client: QueryClient,
  sessionId: string,
  user: { id: string; role: "student" | "professor" }
): Promise<MutationResult<SummaryComparisonResponse>> {
  const access = await getSessionAccessPostgres(client, sessionId, user);
  if (!access) return { ok: false, status: 404, error: "Summary comparison not found." };

  const submittedResult = await client.query<ReportSnapshotRow>(
    `select submission_snapshots.captured_at, submission_snapshots.text
     from submissions
     join submission_snapshots on submission_snapshots.id = submissions.submitted_snapshot_id
     where submissions.session_id = $1`,
    [sessionId]
  );
  const summaryResult = await client.query<ReportSummaryRow>(
    `select timed_summaries.summary_text, timed_summaries.response_items
     from comprehension_responses
     join timed_summaries on timed_summaries.id = comprehension_responses.timed_summary_id
     where comprehension_responses.session_id = $1`,
    [sessionId]
  );
  const submittedText = submittedResult.rows[0]?.text || "";
  const summaryResponses = normalizeComprehensionResponses(summaryResult.rows[0]?.response_items);
  const summaryText = comprehensionAnswerText(summaryResponses, summaryResult.rows[0]?.summary_text || "");
  if (!submittedText || !summaryText) {
    return { ok: false, status: 409, error: "Summary comparison is not ready." };
  }

  return {
    ok: true,
    value: compareSummaryToPaper(submittedText, summaryText)
  };
}

export async function getProfessorReportPostgres(
  client: QueryClient,
  sessionId: string,
  professorId: string
): Promise<MutationResult<ProfessorReportResponse>> {
  const access = await client.query<{ id: string; prompt?: string }>(
    `select writing_sessions.id, assignments.prompt
     from writing_sessions
     join assignments on assignments.id = writing_sessions.assignment_id
     join assignment_instructors on assignment_instructors.assignment_id = writing_sessions.assignment_id
     where writing_sessions.id = $1 and assignment_instructors.professor_id = $2`,
    [sessionId, professorId]
  );
  if (!access.rows[0]) return { ok: false, status: 404, error: "Report not found." };
  const assignmentPrompt = access.rows[0].prompt || "";

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
    "select summary_text, response_items, started_at, completed_at from timed_summaries where session_id = $1",
    [sessionId]
  );

  const events = eventsResult.rows.map(mapEventRow);
  const snapshots = snapshotsResult.rows.map(mapSnapshotRow);
  const submittedText = snapshots.at(-1)?.text || "";
  const summaryResponses = normalizeComprehensionResponses(summaryResult.rows[0]?.response_items);
  const summaryText = comprehensionAnswerText(summaryResponses, summaryResult.rows[0]?.summary_text || "");
  const summaryStartedAt = nullableTimeToMs(summaryResult.rows[0]?.started_at || null);
  const summaryCompletedAt = nullableTimeToMs(summaryResult.rows[0]?.completed_at || null);
  const frames = reconstructReplayForReport(snapshots, events);
  const behavioralRisk = submittedText ? analyzeBehavioralRisk(events, submittedText) : emptyBehavioralRiskForReport();
  const existingReportResult = await client.query<ExistingReportRow>(
    `select observations
     from professor_reports
     where session_id = $1 and professor_id = $2
     order by generated_at desc
     limit 1`,
    [sessionId, professorId]
  );
  const existingObservations = normalizeStoredObservations(existingReportResult.rows[0]?.observations);
  if (existingObservations) {
    const comparison = compareSummaryToPaper(submittedText, summaryText);
    const existingTags = submittedText
      ? [
        ...generateProcessEvidenceTags(events, submittedText),
        ...generateBehavioralRiskEvidenceTags(behavioralRisk.signals),
        ...(summaryText ? generateSummaryEvidenceTags(comparison) : []),
        ...generateObservationEvidenceTags(existingObservations)
      ]
      : generateObservationEvidenceTags(existingObservations);
    const processFeatures = extractProcessFeatures({
      events,
      submittedText,
      submittedAt: snapshots.at(-1)?.at
    });
    const comprehensionFeatures = extractComprehensionFeatures({
      submittedText,
      summaryText,
      comparison,
      responses: summaryResponses,
      startedAt: summaryStartedAt,
      completedAt: summaryCompletedAt
    });
    existingTags.push(...generateComprehensionFeatureTags(comprehensionFeatures));
    const planningSourceFeatures = extractPlanningSourceFeatures({
      events,
      submittedText,
      promptText: assignmentPrompt,
      submittedAt: snapshots.at(-1)?.at
    });
    existingTags.push(...generatePlanningSourceEvidenceTags(planningSourceFeatures));
    const highlights = buildReportProcessHighlights(events, frames, existingTags);
    const authorCheck = buildAuthorCheckSummary({
      events,
      submittedText,
      summaryText,
      behavioralRisk,
      tags: existingTags,
      processFeatures,
      comprehensionFeatures,
      planningSourceFeatures
    });
    return {
      ok: true,
      value: {
        observations: existingObservations,
        tags: existingTags,
        behavioralRisk,
        authorCheck,
        processFeatures,
        comprehensionFeatures,
        planningSourceFeatures,
        frames,
        ...highlights,
        submittedText,
        summaryText,
        comprehensionResponses: summaryResponses
      }
    };
  }

  const observations = submittedText
    ? [...analyzeProcessForReport(events, submittedText), ...behavioralSignalsToObservations(behavioralRisk.signals)]
    : [];
  const tags = submittedText
    ? [
      ...generateProcessEvidenceTags(events, submittedText),
      ...generateBehavioralRiskEvidenceTags(behavioralRisk.signals)
    ]
    : [];
  let audit = null;
  let comparison = compareSummaryToPaper(submittedText, summaryText);
  if (submittedText && summaryText) {
    const evaluation = await evaluateSummaryComparison(sessionId, submittedText, summaryText);
    comparison = evaluation.comparison;
    observations.push(...comparisonToObservations(comparison));
    tags.push(...generateSummaryEvidenceTags(comparison));
    audit = evaluation.audit;
  }
  tags.push(...generateObservationEvidenceTags(observations));
  const reportId = await createProfessorReportPostgres(client, sessionId, professorId, observations, frames.length);
  if (audit) await writeAiEvaluationLog(client, sessionId, reportId, audit);
  const processFeatures = extractProcessFeatures({
    events,
    submittedText,
    submittedAt: snapshots.at(-1)?.at
  });
  const comprehensionFeatures = extractComprehensionFeatures({
    submittedText,
    summaryText,
    comparison,
    responses: summaryResponses,
    startedAt: summaryStartedAt,
    completedAt: summaryCompletedAt
  });
  tags.push(...generateComprehensionFeatureTags(comprehensionFeatures));
  const planningSourceFeatures = extractPlanningSourceFeatures({
    events,
    submittedText,
    promptText: assignmentPrompt,
    submittedAt: snapshots.at(-1)?.at
  });
  tags.push(...generatePlanningSourceEvidenceTags(planningSourceFeatures));
  const highlights = buildReportProcessHighlights(events, frames, tags);
  const authorCheck = buildAuthorCheckSummary({
    events,
    submittedText,
    summaryText,
    behavioralRisk,
    tags,
    processFeatures,
    comprehensionFeatures,
    planningSourceFeatures
  });

  return {
    ok: true,
    value: {
      observations,
      tags,
      behavioralRisk,
      authorCheck,
      processFeatures,
      comprehensionFeatures,
      planningSourceFeatures,
      frames,
      ...highlights,
      submittedText,
      summaryText,
      comprehensionResponses: summaryResponses
    }
  };
}

export async function exportProfessorReportPostgres(
  client: QueryClient,
  sessionId: string,
  professorId: string,
  format: ReportExportFormat
): Promise<MutationResult<ReportExportResponse>> {
  const report = await getProfessorReportPostgres(client, sessionId, professorId);
  if (!report.ok) return report;

  await client.query(
    `update professor_reports
     set exported_at = now()
     where id = (
       select id
       from professor_reports
       where session_id = $1 and professor_id = $2
       order by generated_at desc
       limit 1
     )`,
    [sessionId, professorId]
  );

  return { ok: true, value: createReportExport(report.value, format, sessionId) };
}

export async function saveProfessorGradePostgres(
  client: QueryClient,
  sessionId: string,
  professorId: string,
  body: SaveProfessorGradeBody
): Promise<MutationResult<SaveProfessorGradeResponse>> {
  const access = await getSessionAccessPostgres(client, sessionId, { id: professorId, role: "professor" });
  if (!access) return { ok: false, status: 404, error: "Submission not found." };

  if (!Number.isInteger(body.gradePercent) || body.gradePercent < 0 || body.gradePercent > 100) {
    return { ok: false, status: 400, error: "Grade must be between 0 and 100." };
  }

  const result = await client.query<{ grade_percent: number; graded_at: Date | string }>(
    `insert into professor_grades (
       session_id,
       professor_id,
       grade_percent,
       rubric_scores,
       comments,
       graded_at
     ) values ($1, $2, $3, $4::jsonb, $5::jsonb, now())
     on conflict (session_id, professor_id) do update
     set grade_percent = excluded.grade_percent,
         rubric_scores = excluded.rubric_scores,
         comments = excluded.comments,
         graded_at = now()
     returning grade_percent, graded_at`,
    [
      sessionId,
      professorId,
      body.gradePercent,
      JSON.stringify({}),
      JSON.stringify(body.comments)
    ]
  );
  const row = result.rows[0];

  return {
    ok: true,
    value: {
      gradePercent: row.grade_percent,
      gradedAt: timeToMs(row.graded_at)
    }
  };
}

function emptyBehavioralRiskForReport() {
  return {
    highCount: 0,
    mediumCount: 0,
    positiveCount: 0,
    signals: []
  };
}

async function withTransaction<T>(
  client: QueryClient,
  callback: (transactionClient: QueryClient) => Promise<T>
) {
  if (!isConnectableQueryClient(client)) return callback(client);

  const transactionClient = await client.connect();
  try {
    await transactionClient.query("begin");
    const result = await callback(transactionClient);
    await transactionClient.query("commit");
    return result;
  } catch (error) {
    await transactionClient.query("rollback");
    throw error;
  } finally {
    transactionClient.release();
  }
}

function isConnectableQueryClient(client: QueryClient): client is ConnectableQueryClient {
  return typeof (client as { connect?: unknown }).connect === "function";
}

function normalizeClassJoinCode(code: string) {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function createClassJoinCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const bytes = randomBytes(8);
  for (let index = 0; index < 8; index += 1) {
    code += alphabet[bytes[index] % alphabet.length];
  }
  return code;
}

function createInvitationToken() {
  return randomBytes(24).toString("base64url");
}

function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function assignClassJoinCodePostgres(client: QueryClient, classId: string) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const joinCode = createClassJoinCode();
    const result = await client.query<{ join_code: string }>(
      `update assignments
       set join_code = $2
       where id = $1
         and (join_code is null or join_code = $2)
       returning join_code`,
      [classId, joinCode]
    );
    if (result.rows[0]?.join_code) return result.rows[0].join_code;
  }
  throw new Error("Unable to generate a unique class join code.");
}

async function enrollStudentInClassHierarchyPostgres(client: QueryClient, classId: string, studentId: string) {
  const result = await client.query(
    `insert into assignment_students (assignment_id, student_id)
     select id, $2
     from assignments
     where id = $1 or class_id = $1
     on conflict (assignment_id, student_id) do nothing`,
    [classId, studentId]
  );
  return result.rowCount ?? 0;
}

async function requireProfessorAssignmentAccess(
  client: QueryClient,
  assignmentId: string,
  professorId: string
): Promise<MutationResult<{ id: string }>> {
  const access = await client.query<{ id: string }>(
    `select assignment_id as id
     from assignment_instructors
     where assignment_id = $1 and professor_id = $2`,
    [assignmentId, professorId]
  );
  if (!access.rows[0]) return { ok: false, status: 403, error: "Professor cannot access this assignment." };
  return { ok: true, value: access.rows[0] };
}

async function requireProfessorClassAccess(
  client: QueryClient,
  classId: string,
  professorId: string
): Promise<MutationResult<{ id: string }>> {
  const access = await client.query<{ id: string }>(
    `select assignments.id
     from assignments
     join assignment_instructors on assignment_instructors.assignment_id = assignments.id
     where assignments.id = $1
       and assignment_instructors.professor_id = $2
       and assignments.kind = 'class'`,
    [classId, professorId]
  );
  if (!access.rows[0]) return { ok: false, status: 403, error: "Professor cannot access this class." };
  return { ok: true, value: access.rows[0] };
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

async function getSessionAccessPostgres(
  client: QueryClient,
  sessionId: string,
  user: { id: string; role: "student" | "professor" }
) {
  if (user.role === "student") {
    const result = await client.query<{ id: string }>(
      `select id
       from writing_sessions
       where id = $1 and student_id = $2`,
      [sessionId, user.id]
    );
    return result.rows[0] || null;
  }

  const result = await client.query<{ id: string }>(
    `select writing_sessions.id
     from writing_sessions
     join assignment_instructors on assignment_instructors.assignment_id = writing_sessions.assignment_id
     where writing_sessions.id = $1 and assignment_instructors.professor_id = $2`,
    [sessionId, user.id]
  );
  return result.rows[0] || null;
}

async function createFirstAttemptPostgres(client: QueryClient, assignmentId: string, studentId: string) {
  const insertResult = await client.query<{ id: string }>(
    `insert into writing_sessions (assignment_id, student_id, attempt_number, status)
     values ($1, $2, 1, 'draft')
     on conflict (assignment_id, student_id, attempt_number) do nothing
     returning id`,
    [assignmentId, studentId]
  );
  if (insertResult.rows[0]) return insertResult.rows[0].id;

  const existingResult = await client.query<{ id: string }>(
    `select id
     from writing_sessions
     where assignment_id = $1
       and student_id = $2
       and status <> 'archived'
     order by attempt_number desc
     limit 1`,
    [assignmentId, studentId]
  );
  if (existingResult.rows[0]) return existingResult.rows[0].id;

  throw new Error("First writing attempt already exists but is not active.");
}

async function createProfessorReportPostgres(
  client: QueryClient,
  sessionId: string,
  professorId: string,
  observations: Observation[],
  replayFrameCount: number
) {
  const result = await client.query<{ id: string }>(
    `insert into professor_reports (
       session_id,
       professor_id,
       observations,
       replay_frame_count
     ) values ($1, $2, $3::jsonb, $4)
     returning id`,
    [sessionId, professorId, JSON.stringify(observations), replayFrameCount]
  );

  return result.rows[0]?.id || null;
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

async function ensureSessionState(client: QueryClient, sessionId: string) {
  await client.query(
    `insert into writing_session_state (
       session_id,
       current_text,
       current_text_sha256,
       last_event_index,
       updated_at
     ) values ($1, '', $2, -1, now())
     on conflict (session_id) do nothing`,
    [sessionId, sha256("")]
  );
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

function normalizeStoredObservations(value: unknown): Observation[] | null {
  const parsed = typeof value === "string" ? safeJsonParse(value) : value;
  if (!Array.isArray(parsed)) return null;

  const observations = parsed.filter(isStoredObservation);
  return observations.length === parsed.length ? observations : null;
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isStoredObservation(value: unknown): value is Observation {
  if (!value || typeof value !== "object") return false;
  const observation = value as Partial<Observation>;

  return (
    typeof observation.group === "string" &&
    typeof observation.title === "string" &&
    typeof observation.detail === "string"
  );
}

function timeToMs(value: Date | string) {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function nullableTimeToMs(value: Date | string | null) {
  return value ? timeToMs(value) : null;
}

function parseComprehensionQuestions(value: unknown) {
  const parsed = typeof value === "string" ? safeJsonParse(value) : value;
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
}

function reconstructReplayForReport(snapshots: Snapshot[], events: WritingEvent[]) {
  const orderedSnapshots = [...snapshots].sort((a, b) => a.at - b.at);
  const orderedEvents = [...events].sort((a, b) => a.at - b.at);
  const firstSnapshot = resolveReplayStartSnapshotForReport(orderedSnapshots, orderedEvents);
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

function resolveReplayStartSnapshotForReport(snapshots: Snapshot[], events: WritingEvent[]) {
  const firstEventAt = events[0]?.at ?? Date.now();
  const lastEventAt = events.at(-1)?.at ?? Number.MAX_SAFE_INTEGER;
  const nonFinalSnapshot = snapshots.find((snapshot) => snapshot.at < lastEventAt);
  if (nonFinalSnapshot) return nonFinalSnapshot;
  return { at: firstEventAt, text: "" };
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
  const reportableDeletionCharacters = 50;
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
      group: "Context Event",
      title: "No text-removal events recorded",
      detail: "No deletion or text-removal events were recorded; this is inconclusive without other process indicators."
    });
  }

  deletionEvents.forEach((event) => {
    const removedCharacters = event.removedCharacters || event.removed?.length || 0;
    if (removedCharacters < reportableDeletionCharacters) return;
    observations.push({
      group: "Context Event",
      title: "Deletion event",
      detail: `${removedCharacters} characters were deleted at ${new Date(event.at).toLocaleTimeString()}.`
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
