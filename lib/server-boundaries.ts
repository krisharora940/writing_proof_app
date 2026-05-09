import type { Snapshot, WritingEvent } from "./writing-events";
import type { SessionMetrics } from "./writing-events";
import type { ReplayFrame } from "./replay";
import type { SummaryComparison } from "./summary-comparison";
import type { Observation } from "./writing-events";
import type { ReportExport } from "./report-export";
import type { EvidenceTag } from "./evidence-tags";
import type { BehavioralRiskSummary } from "./behavioral-risk";

export type ApiBoundary = {
  method: "GET" | "POST" | "DELETE";
  path: string;
  access: "student" | "professor" | "student-or-professor";
  purpose: string;
};

export const API_BOUNDARIES: ApiBoundary[] = [
  {
    method: "POST",
    path: "/api/auth/login",
    access: "student-or-professor",
    purpose: "Create a server-side session for a password or provider-authenticated identity."
  },
  {
    method: "POST",
    path: "/api/auth/signup",
    access: "student-or-professor",
    purpose: "Create a professor account or invite-backed student account with server-side password handling."
  },
  {
    method: "GET",
    path: "/api/auth/me",
    access: "student-or-professor",
    purpose: "Return the signed-in user derived from the server session."
  },
  {
    method: "GET",
    path: "/api/assignments",
    access: "student",
    purpose: "List assignments visible to the signed-in student with latest session status."
  },
  {
    method: "GET",
    path: "/api/assignments/current",
    access: "student",
    purpose: "Load or create the signed-in student's writing session for one assigned assignment."
  },
  {
    method: "POST",
    path: "/api/sessions/reset",
    access: "student",
    purpose: "Disabled legacy route; students receive one submission per assignment."
  },
  {
    method: "GET",
    path: "/api/professor/assignments",
    access: "professor",
    purpose: "List assignments visible to the signed-in professor."
  },
  {
    method: "POST",
    path: "/api/professor/assignments",
    access: "professor",
    purpose: "Create an assignment owned by the signed-in professor."
  },
  {
    method: "GET",
    path: "/api/professor/assignments/:assignmentId/students",
    access: "professor",
    purpose: "List students enrolled in a professor-owned assignment."
  },
  {
    method: "POST",
    path: "/api/professor/assignments/:assignmentId/students",
    access: "professor",
    purpose: "Enroll one student in a professor-owned assignment."
  },
  {
    method: "DELETE",
    path: "/api/professor/assignments/:assignmentId/students",
    access: "professor",
    purpose: "Remove one student from a professor-owned assignment before or outside review."
  },
  {
    method: "GET",
    path: "/api/assignments/:assignmentId/submissions",
    access: "professor",
    purpose: "List enrolled students and their latest writing sessions for a professor-owned assignment."
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
    method: "GET",
    path: "/api/sessions/:sessionId/metrics",
    access: "student-or-professor",
    purpose: "Return server-derived process metrics for an authorized writing session."
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

export type SignupBody = {
  displayName: string;
  email: string;
  password: string;
  role: "student" | "professor";
  inviteCode?: string;
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

export type SessionMetricsResponse = {
  metrics: SessionMetrics;
};

export type ReplayRequestBody = {
  sessionId: string;
};

export type SummaryComparisonResponse = SummaryComparison;

export type SummaryComparisonRequestBody = {
  sessionId: string;
};

export type PasteEventCard = {
  id: string;
  eventId: string;
  at: number;
  title: string;
  detail: string;
  wordCount: number;
  characterCount: number;
  textPreview: string;
  tagIds: string[];
  replayFrameIndex: number | null;
};

export type ReportTimelineMarker = {
  id: string;
  eventId: string | null;
  at: number;
  kind: "draft-start" | "paste-event" | "report-tag" | "submission";
  label: string;
  detail: string;
  tagIds: string[];
  replayFrameIndex: number | null;
};

export type ProfessorReportResponse = {
  observations: Observation[];
  tags: EvidenceTag[];
  behavioralRisk: BehavioralRiskSummary;
  frames: ReplayFrame[];
  pasteEventCards: PasteEventCard[];
  timelineMarkers: ReportTimelineMarker[];
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

export type StudentAssignmentListResponse = {
  assignments: Array<{
    id: string;
    title: string;
    prompt: string;
    dueAt: number | null;
    enrolledAt: number;
    sessionId: string | null;
    status: string;
    submittedAt: number | null;
    lockedAt: number | null;
    attemptNumber: number | null;
  }>;
};

export type ProfessorAssignmentListResponse = {
  assignments: Array<{
    id: string;
    title: string;
    prompt: string;
    dueAt: number | null;
    createdAt: number;
  }>;
};

export type CreateProfessorAssignmentBody = {
  title: string;
  prompt: string;
  dueAt?: number | null;
};

export type CreateProfessorAssignmentResponse = {
  assignment: ProfessorAssignmentListResponse["assignments"][number];
};

export type AssignmentSubmissionListResponse = {
  submissions: Array<{
    sessionId: string | null;
    studentId: string;
    studentName: string;
    studentEmail: string;
    status: string;
    submittedAt: number | null;
    lockedAt: number | null;
    attemptNumber: number | null;
  }>;
};

export type AssignmentRosterResponse = {
  students: Array<{
    studentId: string;
    studentName: string;
    studentEmail: string;
    enrolledAt: number;
  }>;
};

export type EnrollAssignmentStudentBody = {
  email: string;
  displayName: string;
};

export type RemoveAssignmentStudentBody = {
  studentId: string;
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
