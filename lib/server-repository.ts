import type {
  AppendWritingEventRequest,
  LockSubmissionRequest,
  TimedSummaryRequest
} from "./server-boundaries";
import type { Snapshot, WritingEvent } from "./writing-events";

const DEMO_STUDENT_ID = "11111111-1111-4111-8111-111111111111";
const DEMO_ASSIGNMENT_ID = "33333333-3333-4333-8333-333333333333";
const DEMO_SESSION_ID = "44444444-4444-4444-8444-444444444444";

export type ServerSession = {
  id: string;
  assignmentId: string;
  studentId: string;
  submittedAt: number | null;
  lockedAt: number | null;
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
      lockedAt: null
    },
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
  return { ok: true, value: timedSummary };
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
