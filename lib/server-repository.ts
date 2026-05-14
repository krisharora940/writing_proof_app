import type {
  AppendWritingEventRequest,
  AssignmentRosterResponse,
  AssignmentSubmissionListResponse,
  CreateProfessorAssignmentBody,
  CreateProfessorAssignmentResponse,
  CreateProfessorClassBody,
  CreateProfessorClassResponse,
  EnrollAssignmentStudentBody,
  PasteEventCard,
  ProfessorReportResponse,
  ProfessorAssignmentListResponse,
  ProfessorClassListResponse,
  ReportTimelineMarker,
  ReportExportResponse,
  ReplayResponse,
  RemoveAssignmentStudentBody,
  SaveProfessorGradeBody,
  SaveProfessorGradeResponse,
  SessionMetricsResponse,
  SummaryComparisonResponse,
  LockSubmissionRequest,
  StudentAssignmentListResponse,
  StudentSessionResponse,
  TimedSummaryRequest
} from "./server-boundaries";
import { DEMO_ASSIGNMENT_ID, DEMO_PROFESSOR_ID, DEMO_SESSION_ID, DEMO_STUDENT_ID } from "./demo-ids.ts";
import { createReportExport, type ReportExportFormat } from "./report-export.ts";
import { reconstructReplay } from "./replay.ts";
import { compareSummaryToPaper, comparisonToObservations } from "./summary-comparison.ts";
import { analyzeBehavioralRisk, behavioralSignalsToObservations } from "./behavioral-risk.ts";
import { generateBehavioralRiskEvidenceTags, generateObservationEvidenceTags, generateProcessEvidenceTags, generateSummaryEvidenceTags } from "./evidence-tags.ts";
import { buildAuthorCheckSummary } from "./authorcheck-report.ts";
import { analyzeProcess, calculateSessionMetrics, countWords } from "./writing-events.ts";
import type { Snapshot, WritingEvent } from "./writing-events";
import type { ReplayFrame } from "./replay";

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
  assignments: ProfessorAssignmentListResponse["assignments"];
  classes: ProfessorClassListResponse["classes"];
  roster: AssignmentRosterResponse["students"];
  session: ServerSession;
  draftText: string;
  events: WritingEvent[];
  snapshots: Snapshot[];
  submittedText: string;
  timedSummary: StoredTimedSummary | null;
  grades: Record<string, SaveProfessorGradeResponse>;
};

export type MutationResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: string };

type ReportProcessHighlights = Pick<ProfessorReportResponse, "pasteEventCards" | "timelineMarkers">;

export function buildReportProcessHighlights(
  events: WritingEvent[],
  frames: ReplayFrame[],
  tags: ProfessorReportResponse["tags"]
): ReportProcessHighlights {
  const orderedEvents = [...events].sort((a, b) => a.at - b.at);
  const tagsByEvent = new Map<string, ProfessorReportResponse["tags"]>();
  tags.forEach((tag) => {
    if (!tag.eventId) return;
    tagsByEvent.set(tag.eventId, [...(tagsByEvent.get(tag.eventId) || []), tag]);
  });

  const pasteEventCards: PasteEventCard[] = orderedEvents
    .filter((event) => event.type === "paste")
    .map((event) => {
      const wordCount = event.pasteWords || event.addedWords || countWords(event.added || "");
      const characterCount = event.added?.length || 0;
      const eventTags = tagsByEvent.get(event.id) || [];
      return {
        id: `paste-card-${event.id}`,
        eventId: event.id,
        at: event.at,
        title: "Paste event",
        detail: describePasteEvent(wordCount, characterCount),
        wordCount,
        characterCount,
        textPreview: previewText(event.added || ""),
        tagIds: eventTags.map((tag) => tag.id),
        replayFrameIndex: frameIndexForEvent(frames, event.id)
      };
    });

  const timelineMarkers: ReportTimelineMarker[] = [];
  const firstFrame = frames[0];
  if (firstFrame) {
    timelineMarkers.push({
      id: "timeline-draft-start",
      eventId: null,
      at: firstFrame.at,
      kind: "draft-start",
      label: "Draft started",
      detail: "Replay begins from the first saved draft state.",
      tagIds: [],
      replayFrameIndex: 0
    });
  }

  orderedEvents.forEach((event) => {
    const eventTags = tagsByEvent.get(event.id) || [];
    if (event.type === "paste") {
      const wordCount = event.pasteWords || event.addedWords || countWords(event.added || "");
      timelineMarkers.push({
        id: `timeline-paste-${event.id}`,
        eventId: event.id,
        at: event.at,
        kind: "paste-event",
        label: "Paste input",
        detail: describePasteEvent(wordCount, event.added?.length || 0),
        tagIds: eventTags.map((tag) => tag.id),
        replayFrameIndex: frameIndexForEvent(frames, event.id)
      });
    }

    if (event.type === "submit") {
      timelineMarkers.push({
        id: `timeline-submit-${event.id}`,
        eventId: event.id,
        at: event.at,
        kind: "submission",
        label: "Submission recorded",
        detail: event.words ? `${event.words} words were submitted.` : "The writing session was submitted.",
        tagIds: eventTags.map((tag) => tag.id),
        replayFrameIndex: frameIndexForEvent(frames, event.id)
      });
    }
  });

  tags
    .filter((tag) => typeof tag.at === "number" && !tag.eventId)
    .forEach((tag) => {
      timelineMarkers.push({
        id: `timeline-tag-${tag.id}`,
        eventId: null,
        at: tag.at as number,
        kind: "report-tag",
        label: tag.label,
        detail: tag.detail,
        tagIds: [tag.id],
        replayFrameIndex: null
      });
    });

  return {
    pasteEventCards,
    timelineMarkers: timelineMarkers.sort((a, b) => a.at - b.at)
  };
}

function describePasteEvent(wordCount: number, characterCount: number) {
  if (wordCount && characterCount) return `${wordCount} words and ${characterCount} characters were inserted through paste input.`;
  if (wordCount) return `${wordCount} words were inserted through paste input.`;
  if (characterCount) return `${characterCount} characters were inserted through paste input.`;
  return "Text was inserted through paste input.";
}

function previewText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized;
}

function frameIndexForEvent(frames: ReplayFrame[], eventId: string) {
  const index = frames.findIndex((frame) => frame.eventId === eventId);
  return index >= 0 ? index : null;
}

export function createDemoRepositoryState(now = Date.now()): DemoRepositoryState {
  return {
    classes: [{
      id: DEMO_ASSIGNMENT_ID,
      name: "Demo Class",
      studentCount: 1,
      createdAt: 0
    }],
    assignments: [{
      id: DEMO_ASSIGNMENT_ID,
      title: "Process Evidence Reflection",
      prompt: "Write a short paper on whether process evidence is fairer than final-text AI detection.",
      classId: DEMO_ASSIGNMENT_ID,
      dueAt: null,
      createdAt: 0
    }],
    roster: [{
      studentId: DEMO_STUDENT_ID,
      studentName: "Demo Student",
      studentEmail: "student@example.test",
      enrolledAt: 0
    }],
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
    timedSummary: null,
    grades: {}
  };
}

const repositoryState = createDemoRepositoryState();

export function getDemoRepositoryState() {
  return repositoryState;
}

export function resetDemoRepository(now = Date.now()) {
  const nextState = createDemoRepositoryState(now);
  repositoryState.session = nextState.session;
  repositoryState.classes = nextState.classes;
  repositoryState.assignments = nextState.assignments;
  repositoryState.roster = nextState.roster;
  repositoryState.draftText = nextState.draftText;
  repositoryState.events = nextState.events;
  repositoryState.snapshots = nextState.snapshots;
  repositoryState.submittedText = nextState.submittedText;
  repositoryState.timedSummary = nextState.timedSummary;
  repositoryState.grades = nextState.grades;
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
  studentId: string,
  assignmentId?: string
): MutationResult<StudentSessionResponse> {
  if (studentId !== state.session.studentId) {
    return { ok: false, status: 403, error: "Student cannot access this session." };
  }
  if (assignmentId && assignmentId !== state.session.assignmentId) {
    return { ok: false, status: 404, error: "No assignment found for this student." };
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

export function listStudentAssignmentsDemo(
  state: DemoRepositoryState,
  studentId: string
): MutationResult<StudentAssignmentListResponse> {
  if (!state.roster.some((student) => student.studentId === studentId)) {
    return { ok: false, status: 403, error: "Student cannot access assignments." };
  }

  return {
    ok: true,
    value: {
      assignments: state.assignments.map((assignment) => ({
        ...assignment,
        enrolledAt: state.roster.find((student) => student.studentId === studentId)?.enrolledAt || 0,
        sessionId: state.session.assignmentId === assignment.id ? state.session.id : null,
        status: state.session.assignmentId === assignment.id ? state.session.status || "draft" : "not_started",
        submittedAt: state.session.assignmentId === assignment.id ? state.session.submittedAt : null,
        lockedAt: state.session.assignmentId === assignment.id ? state.session.lockedAt : null,
        attemptNumber: state.session.assignmentId === assignment.id ? state.session.attemptNumber || 1 : null
      }))
    }
  };
}

export function listProfessorAssignmentsDemo(
  professorId: string,
  state = repositoryState
): MutationResult<ProfessorAssignmentListResponse> {
  if (professorId !== DEMO_PROFESSOR_ID) {
    return { ok: false, status: 403, error: "Professor cannot access assignments." };
  }

  return {
    ok: true,
    value: {
      assignments: state.assignments
    }
  };
}

export function listProfessorClassesDemo(
  professorId: string,
  state = repositoryState
): MutationResult<ProfessorClassListResponse> {
  if (professorId !== DEMO_PROFESSOR_ID) {
    return { ok: false, status: 403, error: "Professor cannot access classes." };
  }

  return {
    ok: true,
    value: {
      classes: state.classes.map((classroom) => ({
        ...classroom,
        studentCount: state.roster.length
      }))
    }
  };
}

export function createProfessorClassDemo(
  state: DemoRepositoryState,
  professorId: string,
  body: CreateProfessorClassBody
): MutationResult<CreateProfessorClassResponse> {
  if (professorId !== DEMO_PROFESSOR_ID) {
    return { ok: false, status: 403, error: "Professor cannot create classes." };
  }

  const name = body.name.trim();
  if (!name) return { ok: false, status: 400, error: "Class name is required." };

  const classroom = {
    id: crypto.randomUUID(),
    name,
    studentCount: 0,
    createdAt: Date.now()
  };
  state.classes = [classroom, ...state.classes];
  return { ok: true, value: { class: classroom } };
}

export function createProfessorAssignmentDemo(
  state: DemoRepositoryState,
  professorId: string,
  body: CreateProfessorAssignmentBody
): MutationResult<CreateProfessorAssignmentResponse> {
  if (professorId !== DEMO_PROFESSOR_ID) {
    return { ok: false, status: 403, error: "Professor cannot create assignments." };
  }

  const title = body.title.trim();
  const prompt = body.prompt.trim();
  if (!title || !prompt) return { ok: false, status: 400, error: "Assignment title and prompt are required." };

  const assignment = {
    id: crypto.randomUUID(),
    title,
    prompt,
    classId: body.classId ?? state.classes[0]?.id ?? null,
    dueAt: typeof body.dueAt === "number" ? body.dueAt : null,
    createdAt: Date.now()
  };
  state.assignments = [assignment, ...state.assignments];
  return { ok: true, value: { assignment } };
}

export function listAssignmentRosterDemo(
  state: DemoRepositoryState,
  assignmentId: string,
  professorId: string
): MutationResult<AssignmentRosterResponse> {
  if (professorId !== DEMO_PROFESSOR_ID) {
    return { ok: false, status: 403, error: "Professor cannot access this roster." };
  }
  if (!state.assignments.some((assignment) => assignment.id === assignmentId)) {
    return { ok: false, status: 404, error: "Assignment not found." };
  }

  const students = assignmentId === DEMO_ASSIGNMENT_ID ? state.roster : [];
  return { ok: true, value: { students } };
}

export function enrollAssignmentStudentDemo(
  state: DemoRepositoryState,
  assignmentId: string,
  professorId: string,
  body: EnrollAssignmentStudentBody
): MutationResult<AssignmentRosterResponse["students"][number]> {
  if (professorId !== DEMO_PROFESSOR_ID) {
    return { ok: false, status: 403, error: "Professor cannot manage this roster." };
  }
  if (!state.assignments.some((assignment) => assignment.id === assignmentId)) {
    return { ok: false, status: 404, error: "Assignment not found." };
  }

  const email = body.email.trim().toLowerCase();
  const studentName = body.displayName.trim();
  if (!email || !studentName) return { ok: false, status: 400, error: "Student name and email are required." };
  if (state.roster.some((student) => student.studentEmail === email)) {
    return { ok: false, status: 409, error: "Student is already enrolled." };
  }

  const student = {
    studentId: crypto.randomUUID(),
    studentName,
    studentEmail: email,
    enrolledAt: Date.now()
  };
  state.roster = [...state.roster, student];
  return { ok: true, value: student };
}

export function removeAssignmentStudentDemo(
  state: DemoRepositoryState,
  assignmentId: string,
  professorId: string,
  body: RemoveAssignmentStudentBody
): MutationResult<{ studentId: string }> {
  if (professorId !== DEMO_PROFESSOR_ID) {
    return { ok: false, status: 403, error: "Professor cannot manage this roster." };
  }
  if (assignmentId === DEMO_ASSIGNMENT_ID && body.studentId === DEMO_STUDENT_ID) {
    return { ok: false, status: 409, error: "Demo student cannot be removed from the active demo assignment." };
  }

  const beforeCount = state.roster.length;
  state.roster = state.roster.filter((student) => student.studentId !== body.studentId);
  if (state.roster.length === beforeCount) return { ok: false, status: 404, error: "Student enrollment not found." };
  return { ok: true, value: { studentId: body.studentId } };
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
        studentEmail: "student@example.test",
        status: state.session.status || "draft",
        submittedAt: state.session.submittedAt,
        lockedAt: state.session.lockedAt,
        attemptNumber: state.session.attemptNumber || 1,
        gradePercent: state.grades[state.session.id]?.gradePercent ?? null,
        gradedAt: state.grades[state.session.id]?.gradedAt ?? null
      }]
    }
  };
}

export function saveProfessorGradeDemo(
  state: DemoRepositoryState,
  sessionId: string,
  professorId: string,
  body: SaveProfessorGradeBody
): MutationResult<SaveProfessorGradeResponse> {
  if (state.session.id !== sessionId) return { ok: false, status: 404, error: "Submission not found." };
  if (professorId !== DEMO_PROFESSOR_ID) {
    return { ok: false, status: 403, error: "Professor cannot grade this submission." };
  }
  if (!Number.isInteger(body.gradePercent) || body.gradePercent < 0 || body.gradePercent > 100) {
    return { ok: false, status: 400, error: "Grade must be between 0 and 100." };
  }

  const saved = { gradePercent: body.gradePercent, gradedAt: Date.now() };
  state.grades[sessionId] = saved;
  return { ok: true, value: saved };
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

  const behavioralRisk = state.submittedText ? analyzeBehavioralRisk(state.events, state.submittedText) : emptyBehavioralRisk();
  const observations = state.submittedText
    ? [...analyzeProcess(state.events, state.submittedText), ...behavioralSignalsToObservations(behavioralRisk.signals)]
    : [];
  const tags = state.submittedText
    ? [
      ...generateProcessEvidenceTags(state.events, state.submittedText),
      ...generateBehavioralRiskEvidenceTags(behavioralRisk.signals)
    ]
    : [];
  if (state.submittedText && state.timedSummary?.summaryText) {
    const comparison = compareSummaryToPaper(state.submittedText, state.timedSummary.summaryText);
    observations.push(...comparisonToObservations(comparison));
    tags.push(...generateSummaryEvidenceTags(comparison));
  }
  tags.push(...generateObservationEvidenceTags(observations));
  const frames = reconstructReplay(state.snapshots, state.events);
  const highlights = buildReportProcessHighlights(state.events, frames, tags);
  const authorCheck = buildAuthorCheckSummary({
    events: state.events,
    submittedText: state.submittedText,
    summaryText: state.timedSummary?.summaryText || "",
    behavioralRisk,
    tags
  });

  return {
    ok: true,
    value: {
      observations,
      tags,
      behavioralRisk,
      authorCheck,
      frames,
      ...highlights,
      submittedText: state.submittedText,
      summaryText: state.timedSummary?.summaryText || ""
    }
  };
}

function emptyBehavioralRisk() {
  return {
    totalPoints: 0,
    highCount: 0,
    mediumCount: 0,
    positiveCount: 0,
    signals: []
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

export function getSessionMetricsDemo(
  state: DemoRepositoryState,
  sessionId: string,
  user: { id: string; role: "student" | "professor" }
): MutationResult<SessionMetricsResponse> {
  const accessError = requireSessionAccess(state, sessionId, user);
  if (accessError) return accessError;

  return {
    ok: true,
    value: {
      metrics: calculateSessionMetrics(state.events, state.submittedText || state.draftText)
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

function requireSessionAccess(
  state: DemoRepositoryState,
  sessionId: string,
  user: { id: string; role: "student" | "professor" }
): MutationResult<never> | null {
  if (state.session.id !== sessionId) return { ok: false, status: 404, error: "Session not found." };
  if (user.role === "student" && user.id !== state.session.studentId) {
    return { ok: false, status: 404, error: "Session not found." };
  }
  if (user.role === "professor" && user.id !== DEMO_PROFESSOR_ID) {
    return { ok: false, status: 404, error: "Session not found." };
  }
  return null;
}

function applyEventToText(currentText: string, event: WritingEvent) {
  if (event.type === "submit") return currentText;
  if (typeof event.start !== "number") return currentText;

  const removed = event.removed || "";
  const added = event.added || "";
  return `${currentText.slice(0, event.start)}${added}${currentText.slice(event.start + removed.length)}`;
}
