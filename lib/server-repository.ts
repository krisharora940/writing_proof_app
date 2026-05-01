import type {
  AppendWritingEventRequest,
  AssignmentSubmissionListResponse,
  ProfessorReportResponse,
  ProfessorAssignmentListResponse,
  ReportExportResponse,
  ReplayResponse,
  ResetSessionResponse,
  SummaryComparisonResponse,
  LockSubmissionRequest,
  StudentSessionResponse,
  TimedSummaryRequest
} from "./server-boundaries";
import { DEMO_ASSIGNMENT_ID, DEMO_PROFESSOR_ID, DEMO_SESSION_ID, DEMO_STUDENT_ID } from "./demo-ids.ts";
import { createReportExport, type ReportExportFormat } from "./report-export.ts";
import { reconstructReplay } from "./replay.ts";
import { compareSummaryToPaper, comparisonToObservations } from "./summary-comparison.ts";
import { analyzeProcess } from "./writing-events.ts";
import type { Snapshot, WritingEvent } from "./writing-events";

export type ServerSession = {
  id: string;
  assignmentId: string;
  studentId: string;
  submittedAt: number | null;
  lockedAt: number | null;
  status?: string;
  attemptNumber?: number;
};

export type StoredTimedSummary = {
  id: string;
  sessionId: string;
  startedAt: number;
  completedAt: number;
  summaryText: string;
};

export type DemoRepositoryState = {
  session: ServerSession;
  draftText: string;
  events: WritingEvent[];
  snapshots: Snapshot[];
  submittedText: string;
  timedSummary: StoredTimedSummary | null;
};

export type MutationResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: string };

export function createDemoRepositoryState(now = Date.now()): DemoRepositoryState {
  return {
    session: {
      id: DEMO_SESSION_ID,
      assignmentId: DEMO_ASSIGNMENT_ID,
      studentId: DEMO_STUDENT_ID,
      submittedAt: null,
      lockedAt: null,
      status: "draft",
      attemptNumber: 1
    },
    draftText: "",
    events: [],
    snapshots: [{ at: now, text: "" }],
    submittedText: "",
    timedSummary: null
  };
}

const repositoryState = createDemoRepositoryState();

export function getDemoRepositoryState() {
  return repositoryState;
}

export function resetDemoRepository(now = Date.now()) {
  const nextState = createDemoRepositoryState(now);
  repositoryState.session = nextState.session;
  repositoryState.draftText = nextState.draftText;
  repositoryState.events = nextState.events;
  repositoryState.snapshots = nextState.snapshots;
  repositoryState.submittedText = nextState.submittedText;
  repositoryState.timedSummary = nextState.timedSummary;
}

export function appendWritingEvent(
  state: DemoRepositoryState,
  request: AppendWritingEventRequest
): MutationResult<{ event: WritingEvent; eventIndex: number }> {
  const ownershipError = requireStudentSession(state, request.sessionId, request.studentId);
  if (ownershipError) return ownershipError;
  if (state.session.lockedAt !== null) return { ok: false, status: 409, error: "Submission is locked." };

  const event: WritingEvent = {
    id: crypto.randomUUID(),
    ...request.event
  };

  state.events.push(event);
  state.draftText = applyEventToText(state.draftText, event);
  return { ok: true, value: { event, eventIndex: state.events.length - 1 } };
}

export function lockSubmission(
  state: DemoRepositoryState,
  request: LockSubmissionRequest
): MutationResult<{ submittedAt: number; lockedAt: number; snapshotIndex: number }> {
  const ownershipError = requireStudentSession(state, request.sessionId, request.studentId);
  if (ownershipError) return ownershipError;
  if (state.session.submittedAt !== null || state.session.lockedAt !== null) {
    return { ok: false, status: 409, error: "Submission is already locked." };
  }

  const submittedAt = request.snapshot.at;
  state.session.submittedAt = submittedAt;
  state.session.lockedAt = submittedAt;
  state.session.status = "summary_pending";
  state.draftText = request.submittedText;
  state.submittedText = request.submittedText;
  state.snapshots.push(request.snapshot);

  return {
    ok: true,
    value: {
      submittedAt,
      lockedAt: submittedAt,
      snapshotIndex: state.snapshots.length - 1
    }
  };
}

export function storeTimedSummary(
  state: DemoRepositoryState,
  request: TimedSummaryRequest
): MutationResult<StoredTimedSummary> {
  const ownershipError = requireStudentSession(state, request.sessionId, request.studentId);
  if (ownershipError) return ownershipError;
  if (state.session.submittedAt === null || state.timedSummary !== null) {
    return { ok: false, status: 409, error: "Timed summary cannot be stored for this session." };
  }
  if (request.completedAt < request.startedAt) {
    return { ok: false, status: 400, error: "Timed summary completion must be after start." };
  }

  const timedSummary: StoredTimedSummary = {
    id: crypto.randomUUID(),
    sessionId: request.sessionId,
    startedAt: request.startedAt,
    completedAt: request.completedAt,
    summaryText: request.summaryText
  };

  state.timedSummary = timedSummary;
  state.session.status = "summary_submitted";
  return { ok: true, value: timedSummary };
}

export function getCurrentStudentSessionDemo(
  state: DemoRepositoryState,
  studentId: string
): MutationResult<StudentSessionResponse> {
  if (studentId !== state.session.studentId) {
    return { ok: false, status: 403, error: "Student cannot access this session." };
  }

  return {
    ok: true,
    value: {
      assignment: {
        id: DEMO_ASSIGNMENT_ID,
        title: "Process Evidence Reflection",
        prompt: "Write a short paper on whether process evidence is fairer than final-text AI detection."
      },
      session: {
        id: state.session.id,
        assignmentId: state.session.assignmentId,
        studentId: state.session.studentId,
        submittedAt: state.session.submittedAt,
        lockedAt: state.session.lockedAt,
        status: state.session.status || "draft",
        attemptNumber: state.session.attemptNumber || 1
      },
      paperText: state.draftText,
      submittedText: state.submittedText,
      summaryText: state.timedSummary?.summaryText || "",
      summaryCompletedAt: state.timedSummary?.completedAt || null,
      events: state.events,
      snapshots: state.snapshots
    }
  };
}

export function listProfessorAssignmentsDemo(professorId: string): MutationResult<ProfessorAssignmentListResponse> {
  if (professorId !== DEMO_PROFESSOR_ID) {
    return { ok: false, status: 403, error: "Professor cannot access assignments." };
  }

  return {
    ok: true,
    value: {
      assignments: [{
        id: DEMO_ASSIGNMENT_ID,
        title: "Process Evidence Reflection",
        prompt: "Write a short paper on whether process evidence is fairer than final-text AI detection.",
        createdAt: 0
      }]
    }
  };
}

export function listAssignmentSubmissionsDemo(
  state: DemoRepositoryState,
  assignmentId: string,
  professorId: string
): MutationResult<AssignmentSubmissionListResponse> {
  if (professorId !== DEMO_PROFESSOR_ID) {
    return { ok: false, status: 403, error: "Professor cannot access this assignment." };
  }
  if (assignmentId !== DEMO_ASSIGNMENT_ID) return { ok: false, status: 404, error: "Assignment not found." };

  return {
    ok: true,
    value: {
      submissions: [{
        sessionId: state.session.id,
        studentId: state.session.studentId,
        studentName: "Demo Student",
        status: state.session.status || "draft",
        submittedAt: state.session.submittedAt,
        lockedAt: state.session.lockedAt,
        attemptNumber: state.session.attemptNumber || 1
      }]
    }
  };
}

export function resetCurrentStudentSessionDemo(
  state: DemoRepositoryState,
  studentId: string
): MutationResult<ResetSessionResponse> {
  if (studentId !== state.session.studentId) {
    return { ok: false, status: 403, error: "Student cannot reset this session." };
  }

  const nextAttempt = (state.session.attemptNumber || 1) + 1;
  state.session = {
    ...state.session,
    id: crypto.randomUUID(),
    submittedAt: null,
    lockedAt: null,
    status: "draft",
    attemptNumber: nextAttempt
  };
  state.draftText = "";
  state.events = [];
  state.snapshots = [{ at: Date.now(), text: "" }];
  state.submittedText = "";
  state.timedSummary = null;

  return {
    ok: true,
    value: {
      sessionId: state.session.id,
      assignmentId: state.session.assignmentId,
      attemptNumber: nextAttempt
    }
  };
}

export function getProfessorReportDemo(
  state: DemoRepositoryState,
  sessionId: string,
  professorId: string
): MutationResult<ProfessorReportResponse> {
  if (state.session.id !== sessionId) return { ok: false, status: 404, error: "Report not found." };
  if (professorId !== DEMO_PROFESSOR_ID) {
    return { ok: false, status: 403, error: "Professor cannot access this report." };
  }

  const observations = state.submittedText ? analyzeProcess(state.events, state.submittedText) : [];
  if (state.submittedText && state.timedSummary?.summaryText) {
    observations.push(...comparisonToObservations(compareSummaryToPaper(state.submittedText, state.timedSummary.summaryText)));
  }

  return {
    ok: true,
    value: {
      observations,
      frames: reconstructReplay(state.snapshots, state.events),
      submittedText: state.submittedText,
      summaryText: state.timedSummary?.summaryText || ""
    }
  };
}

export function getReplayDemo(
  state: DemoRepositoryState,
  sessionId: string,
  user: { id: string; role: "student" | "professor" }
): MutationResult<ReplayResponse> {
  if (state.session.id !== sessionId) return { ok: false, status: 404, error: "Replay not found." };
  if (user.role === "student" && user.id !== state.session.studentId) {
    return { ok: false, status: 404, error: "Replay not found." };
  }
  if (user.role === "professor" && user.id !== DEMO_PROFESSOR_ID) {
    return { ok: false, status: 404, error: "Replay not found." };
  }

  return {
    ok: true,
    value: {
      frames: reconstructReplay(state.snapshots, state.events)
    }
  };
}

export function getSummaryComparisonDemo(
  state: DemoRepositoryState,
  sessionId: string,
  user: { id: string; role: "student" | "professor" }
): MutationResult<SummaryComparisonResponse> {
  if (state.session.id !== sessionId) return { ok: false, status: 404, error: "Summary comparison not found." };
  if (user.role === "student" && user.id !== state.session.studentId) {
    return { ok: false, status: 404, error: "Summary comparison not found." };
  }
  if (user.role === "professor" && user.id !== DEMO_PROFESSOR_ID) {
    return { ok: false, status: 404, error: "Summary comparison not found." };
  }
  if (!state.submittedText || !state.timedSummary?.summaryText) {
    return { ok: false, status: 409, error: "Summary comparison is not ready." };
  }

  return {
    ok: true,
    value: compareSummaryToPaper(state.submittedText, state.timedSummary.summaryText)
  };
}

export function exportProfessorReportDemo(
  state: DemoRepositoryState,
  sessionId: string,
  professorId: string,
  format: ReportExportFormat
): MutationResult<ReportExportResponse> {
  const report = getProfessorReportDemo(state, sessionId, professorId);
  if (!report.ok) return report;
  return { ok: true, value: createReportExport(report.value, format, sessionId) };
}

function requireStudentSession(
  state: DemoRepositoryState,
  sessionId: string,
  studentId: string
): MutationResult<never> | null {
  if (state.session.id !== sessionId) return { ok: false, status: 404, error: "Writing session not found." };
  if (state.session.studentId !== studentId) return { ok: false, status: 403, error: "Student cannot access this session." };
  return null;
}

function applyEventToText(currentText: string, event: WritingEvent) {
  if (event.type === "submit") return currentText;
  if (typeof event.start !== "number") return currentText;

  const removed = event.removed || "";
  const added = event.added || "";
  return `${currentText.slice(0, event.start)}${added}${currentText.slice(event.start + removed.length)}`;
}
