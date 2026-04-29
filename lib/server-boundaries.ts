import type { Snapshot, WritingEvent } from "./writing-events";
import type { ReplayFrame } from "./replay";
import type { SummaryComparison } from "./summary-comparison";

export type ApiBoundary = {
  method: "GET" | "POST";
  path: string;
  access: "student" | "professor" | "student-or-professor";
  purpose: string;
};

export const API_BOUNDARIES: ApiBoundary[] = [
  {
    method: "GET",
    path: "/api/assignments/current",
    access: "student-or-professor",
    purpose: "Load assignments visible to the signed-in user."
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
    access: "professor",
    purpose: "Reconstruct replay frames from persisted snapshots and events."
  },
  {
    method: "POST",
    path: "/api/summary-comparison",
    access: "professor",
    purpose: "Return schema-validated summary-to-paper observations."
  },
  {
    method: "GET",
    path: "/api/reports/:sessionId",
    access: "professor",
    purpose: "Load the neutral evidence report for an owned assignment."
  }
];

export type AppendWritingEventRequest = {
  sessionId: string;
  studentId: string;
  event: Omit<WritingEvent, "id">;
};

export type LockSubmissionRequest = {
  sessionId: string;
  studentId: string;
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

export type ReplayResponse = {
  frames: ReplayFrame[];
};

export type SummaryComparisonResponse = SummaryComparison;

export function canAppendEvent(session: { lockedAt: number | null }) {
  return session.lockedAt === null;
}

export function canLockSubmission(session: { submittedAt: number | null; lockedAt: number | null }) {
  return session.submittedAt === null && session.lockedAt === null;
}

export function canStoreTimedSummary(session: { submittedAt: number | null }, existingSummary: { id: string } | null) {
  return session.submittedAt !== null && existingSummary === null;
}
