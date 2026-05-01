import type { Snapshot, WritingEvent } from "./writing-events";
import type { ReplayFrame } from "./replay";
import type { SummaryComparison } from "./summary-comparison";
import type { Observation } from "./writing-events";
import type { ReportExport } from "./report-export";

export type ApiBoundary = {
  method: "GET" | "POST";
  path: string;
  access: "student" | "professor" | "student-or-professor";
  purpose: string;
};

export const API_BOUNDARIES: ApiBoundary[] = [
  {
    method: "POST",
    path: "/api/auth/login",
    access: "student-or-professor",
    purpose: "Create a server-side session for a known authenticated identity."
  },
  {
    method: "GET",
    path: "/api/auth/me",
    access: "student-or-professor",
    purpose: "Return the signed-in user derived from the server session."
  },
  {
    method: "GET",
    path: "/api/assignments/current",
    access: "student-or-professor",
    purpose: "Load assignments visible to the signed-in user."
  },
  {
    method: "POST",
    path: "/api/sessions/reset",
    access: "student",
    purpose: "Create a new writing attempt without mutating prior evidence."
  },
  {
    method: "GET",
    path: "/api/professor/assignments",
    access: "professor",
    purpose: "List assignments visible to the signed-in professor."
  },
  {
    method: "GET",
    path: "/api/assignments/:assignmentId/submissions",
    access: "professor",
    purpose: "List student writing sessions for a professor-owned assignment."
  },
  {
    method: "POST",
    path: "/api/writing-events",
    access: "student",
    purpose: "Append one factual writing event to an unlocked writing session."
  },
  {
    method: "POST",
    path: "/api/submissions/lock",
    access: "student",
    purpose: "Create the immutable submitted-text snapshot and lock further editing."
  },
  {
    method: "POST",
    path: "/api/timed-summaries",
    access: "student",
    purpose: "Store one immutable timed summary after submission."
  },
  {
    method: "POST",
    path: "/api/replay",
    access: "student-or-professor",
    purpose: "Reconstruct replay frames from persisted snapshots and events for an authorized session."
  },
  {
    method: "POST",
    path: "/api/summary-comparison",
    access: "student-or-professor",
    purpose: "Return schema-validated summary-to-paper observations from persisted submission and comprehension response data."
  },
  {
    method: "GET",
    path: "/api/reports/:sessionId",
    access: "professor",
    purpose: "Load the neutral evidence report for an owned assignment."
  },
  {
    method: "GET",
    path: "/api/reports/:sessionId/export",
    access: "professor",
    purpose: "Export an owned neutral evidence report as HTML, CSV, or PDF."
  }
];

export type AppendWritingEventRequest = {
  sessionId: string;
  studentId: string;
  event: Omit<WritingEvent, "id">;
};

export type AppendWritingEventBody = {
  sessionId: string;
  event: Omit<WritingEvent, "id">;
};

export type LockSubmissionRequest = {
  sessionId: string;
  studentId: string;
  submittedText: string;
  snapshot: Snapshot;
};

export type LockSubmissionBody = {
  sessionId: string;
  submittedText: string;
  snapshot: Snapshot;
};

export type TimedSummaryRequest = {
  sessionId: string;
  studentId: string;
  startedAt: number;
  completedAt: number;
  summaryText: string;
};

export type TimedSummaryBody = {
  sessionId: string;
  startedAt: number;
  completedAt: number;
  summaryText: string;
};

export type ReplayResponse = {
  frames: ReplayFrame[];
};

export type ReplayRequestBody = {
  sessionId: string;
};

export type SummaryComparisonResponse = SummaryComparison;

export type SummaryComparisonRequestBody = {
  sessionId: string;
};

export type ProfessorReportResponse = {
  observations: Observation[];
  frames: ReplayFrame[];
  submittedText: string;
  summaryText: string;
};

export type ReportExportResponse = ReportExport;

export type StudentSessionResponse = {
  assignment: {
    id: string;
    title: string;
    prompt: string;
  };
  session: {
    id: string;
    assignmentId: string;
    studentId: string;
    submittedAt: number | null;
    lockedAt: number | null;
    status: string;
    attemptNumber: number;
  };
  paperText: string;
  submittedText: string;
  summaryText: string;
  summaryCompletedAt: number | null;
  events: WritingEvent[];
  snapshots: Snapshot[];
};

export type ProfessorAssignmentListResponse = {
  assignments: Array<{
    id: string;
    title: string;
    prompt: string;
    createdAt: number;
  }>;
};

export type AssignmentSubmissionListResponse = {
  submissions: Array<{
    sessionId: string;
    studentId: string;
    studentName: string;
    status: string;
    submittedAt: number | null;
    lockedAt: number | null;
    attemptNumber: number;
  }>;
};

export type ResetSessionResponse = {
  sessionId: string;
  assignmentId: string;
  attemptNumber: number;
};

export function canAppendEvent(session: { lockedAt: number | null }) {
  return session.lockedAt === null;
}

export function canLockSubmission(session: { submittedAt: number | null; lockedAt: number | null }) {
  return session.submittedAt === null && session.lockedAt === null;
}

export function canStoreTimedSummary(session: { submittedAt: number | null }, existingSummary: { id: string } | null) {
  return session.submittedAt !== null && existingSummary === null;
}
