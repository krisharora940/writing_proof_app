import type { Snapshot, WritingEvent } from "./writing-events";
import type { SessionMetrics } from "./writing-events";
import type { ReplayFrame } from "./replay";
import type { SummaryComparison } from "./summary-comparison";
import type { Observation } from "./writing-events";
import type { ReportExport } from "./report-export";
import type { EvidenceTag } from "./evidence-tags";
import type { BehavioralRiskSummary } from "./behavioral-risk";
import type { AuthorCheckSummary } from "./authorcheck-report";
import type { ProcessFeatures } from "./process-features";
import type { PlanningSourceFeatures } from "./planning-source-features";
import type { ComprehensionFeatures } from "./comprehension-features";
import type { ComprehensionCheckSettings } from "./comprehension-check";
import type { ComprehensionResponseItem } from "./comprehension-response";

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
    purpose: "Start signup by validating credentials and sending a verification code to the claimed email address."
  },
  {
    method: "POST",
    path: "/api/auth/signup/verify",
    access: "student-or-professor",
    purpose: "Verify the emailed code, create the account, and establish the server-side session."
  },
  {
    method: "POST",
    path: "/api/auth/signup/resend",
    access: "student-or-professor",
    purpose: "Reissue a signup verification code for an existing pending signup."
  },
  {
    method: "POST",
    path: "/api/auth/password-reset",
    access: "student-or-professor",
    purpose: "Request a password reset email for an existing credential account."
  },
  {
    method: "POST",
    path: "/api/auth/password-reset/:token",
    access: "student-or-professor",
    purpose: "Validate a password reset token and set a new password for that account."
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
    method: "POST",
    path: "/api/student/classes/join",
    access: "student",
    purpose: "Join a class immediately by code and inherit access to its assignments."
  },
  {
    method: "GET",
    path: "/api/professor/classes",
    access: "professor",
    purpose: "List classes owned by the signed-in professor."
  },
  {
    method: "POST",
    path: "/api/professor/classes",
    access: "professor",
    purpose: "Create a class owned by the signed-in professor."
  },
  {
    method: "GET",
    path: "/api/professor/classes/:classId/students",
    access: "professor",
    purpose: "List students enrolled in a professor-owned class."
  },
  {
    method: "POST",
    path: "/api/professor/classes/:classId/invitations",
    access: "professor",
    purpose: "Send one or more class invitation emails for a professor-owned class."
  },
  {
    method: "DELETE",
    path: "/api/professor/classes/:classId/students",
    access: "professor",
    purpose: "Remove one student from a professor-owned class and its assignments."
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
    method: "POST",
    path: "/api/reports/:sessionId/grade",
    access: "professor",
    purpose: "Save a professor grade for an owned submission."
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

export type SignupRequestCodeBody = {
  displayName: string;
  email: string;
  password: string;
  role: "student" | "professor";
  inviteCode?: string;
};

export type SignupVerifyCodeBody = {
  email: string;
  code: string;
};

export type SignupResendCodeBody = {
  email: string;
};

export type PasswordResetRequestBody = {
  email: string;
};

export type PasswordResetConfirmBody = {
  password: string;
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
  responses?: ComprehensionResponseItem[];
};

export type TimedSummaryBody = {
  sessionId: string;
  startedAt: number;
  completedAt: number;
  summaryText: string;
  responses: ComprehensionResponseItem[];
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
  authorCheck: AuthorCheckSummary;
  processFeatures: ProcessFeatures;
  comprehensionFeatures: ComprehensionFeatures;
  planningSourceFeatures: PlanningSourceFeatures;
  frames: ReplayFrame[];
  pasteEventCards: PasteEventCard[];
  timelineMarkers: ReportTimelineMarker[];
  submittedText: string;
  summaryText: string;
  comprehensionResponses: ComprehensionResponseItem[];
};

export type ReportExportResponse = ReportExport;

export type StudentSessionResponse = {
  assignment: {
    id: string;
    title: string;
    prompt: string;
    comprehensionCheck: ComprehensionCheckSettings;
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
  classes: Array<{
    id: string;
    name: string;
    joinedAt: number;
    assignmentCount: number;
    submittedCount: number;
  }>;
  assignments: Array<{
    id: string;
    title: string;
    prompt: string;
    classId: string | null;
    className: string | null;
    comprehensionCheck: ComprehensionCheckSettings;
    dueAt: number | null;
    enrolledAt: number;
    sessionId: string | null;
    status: string;
    submittedAt: number | null;
    lockedAt: number | null;
    attemptNumber: number | null;
  }>;
};

export type SaveProfessorGradeBody = {
  gradePercent: number;
  comments: Array<{
    lineNumber: number;
    text: string;
  }>;
};

export type SaveProfessorGradeResponse = {
  gradePercent: number;
  gradedAt: number;
};

export type ProfessorAssignmentListResponse = {
  assignments: Array<{
    id: string;
    title: string;
    prompt: string;
    classId: string | null;
    dueAt: number | null;
    createdAt: number;
    comprehensionCheck: ComprehensionCheckSettings;
  }>;
};

export type ProfessorClassListResponse = {
  classes: Array<{
    id: string;
    name: string;
    joinCode: string;
    studentCount: number;
    createdAt: number;
  }>;
};

export type CreateProfessorAssignmentBody = {
  title: string;
  prompt: string;
  classId?: string | null;
  dueAt?: number | null;
  comprehensionCheck?: ComprehensionCheckSettings;
};

export type CreateProfessorAssignmentResponse = {
  assignment: ProfessorAssignmentListResponse["assignments"][number];
};

export type CreateProfessorClassBody = {
  name: string;
};

export type CreateProfessorClassResponse = {
  class: ProfessorClassListResponse["classes"][number];
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
    gradePercent: number | null;
    gradedAt: number | null;
  }>;
};

export type AssignmentRosterResponse = {
  students: Array<{
    studentId: string;
    studentName: string;
    studentEmail: string;
    enrolledAt: number;
  }>;
  pendingInvitations: Array<{
    invitationId: string;
    email: string;
    createdAt: number;
    expiresAt: number;
  }>;
};

export type EnrollAssignmentStudentBody = {
  email: string;
  displayName: string;
};

export type InviteClassStudentsBody = {
  emails: string[];
};

export type InviteClassStudentsResponse = {
  invitations: AssignmentRosterResponse["pendingInvitations"];
};

export type JoinClassByCodeBody = {
  code: string;
};

export type JoinClassByCodeResponse = {
  class: ProfessorClassListResponse["classes"][number];
  assignmentsAdded: number;
};

export type ClassInvitationLookupResponse = {
  invitation: {
    invitationId: string;
    classId: string;
    className: string;
    email: string;
    expiresAt: number;
    acceptedAt: number | null;
  };
};

export type AcceptClassInvitationBody = {
  token: string;
};

export type AcceptClassInvitationResponse = {
  class: ProfessorClassListResponse["classes"][number];
  assignmentsAdded: number;
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
