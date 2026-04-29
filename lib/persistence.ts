import type { Snapshot, WritingEvent } from "./writing-events";

const DEMO_STUDENT_ID = "11111111-1111-4111-8111-111111111111";
const DEMO_PROFESSOR_ID = "22222222-2222-4222-8222-222222222222";
const DEMO_ASSIGNMENT_ID = "33333333-3333-4333-8333-333333333333";
const DEMO_SUBMISSION_ID = "55555555-5555-4555-8555-555555555555";

export type Assignment = {
  id: string;
  title: string;
  prompt: string;
};

export type UserRole = "student" | "professor";

export type AuthUser = {
  id: string;
  name: string;
  role: UserRole;
};

export type StoredSubmission = {
  id: string;
  assignmentId: string;
  studentId: string;
  paperText: string;
  events: WritingEvent[];
  snapshots: Snapshot[];
  submittedText: string;
  summaryText: string;
  submittedAt: number | null;
  summaryCompletedAt: number | null;
  updatedAt: number;
};

export type StoredWorkspace = {
  users: AuthUser[];
  currentUserId: string;
  assignment: Assignment;
  submission: StoredSubmission;
};

export const WORKSPACE_STORAGE_KEY = "verified-writing.workspace.v1";

export const DEFAULT_ASSIGNMENT: Assignment = {
  id: DEMO_ASSIGNMENT_ID,
  title: "Process Evidence Reflection",
  prompt: "Write a short paper on whether process evidence is fairer than final-text AI detection."
};

export const DEFAULT_USERS: AuthUser[] = [
  { id: DEMO_STUDENT_ID, name: "Demo Student", role: "student" },
  { id: DEMO_PROFESSOR_ID, name: "Demo Professor", role: "professor" }
];

export function createInitialSubmission(now = Date.now()): StoredSubmission {
  return {
    id: DEMO_SUBMISSION_ID,
    assignmentId: DEFAULT_ASSIGNMENT.id,
    studentId: DEMO_STUDENT_ID,
    paperText: "",
    events: [],
    snapshots: [{ at: now, text: "" }],
    submittedText: "",
    summaryText: "",
    submittedAt: null,
    summaryCompletedAt: null,
    updatedAt: now
  };
}

export function createDefaultWorkspace(now = Date.now()): StoredWorkspace {
  return {
    users: DEFAULT_USERS,
    currentUserId: DEMO_STUDENT_ID,
    assignment: DEFAULT_ASSIGNMENT,
    submission: createInitialSubmission(now)
  };
}

export function loadWorkspace(storage: Pick<Storage, "getItem">): StoredWorkspace {
  const raw = storage.getItem(WORKSPACE_STORAGE_KEY);
  if (!raw) return createDefaultWorkspace();

  try {
    return normalizeWorkspace(JSON.parse(raw));
  } catch {
    return createDefaultWorkspace();
  }
}

export function saveWorkspace(storage: Pick<Storage, "setItem">, workspace: StoredWorkspace) {
  storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
}

export function getCurrentUser(workspace: StoredWorkspace): AuthUser {
  return workspace.users.find((user) => user.id === workspace.currentUserId) || DEFAULT_USERS[0];
}

export function canAccessView(user: AuthUser, view: UserRole) {
  return user.role === view;
}

function normalizeWorkspace(value: unknown): StoredWorkspace {
  if (!value || typeof value !== "object") return createDefaultWorkspace();

  const workspace = value as Partial<StoredWorkspace>;
  const fallback = createDefaultWorkspace();
  const users = normalizeUsers(workspace.users, fallback.users);
  const currentUserId = normalizeCurrentUserId(migrateLegacyId(workspace.currentUserId), users, fallback.currentUserId);
  const assignment = normalizeAssignment(workspace.assignment, fallback.assignment);
  const submission = normalizeSubmission(workspace.submission, assignment.id, fallback.submission);

  return { users, currentUserId, assignment, submission };
}

function normalizeUsers(value: unknown, fallback: AuthUser[]): AuthUser[] {
  if (!Array.isArray(value)) return fallback;

  const users = value.filter(isAuthUser).map((user) => ({
    ...user,
    id: migrateLegacyId(user.id)
  }));
  const hasStudent = users.some((user) => user.role === "student");
  const hasProfessor = users.some((user) => user.role === "professor");

  return hasStudent && hasProfessor ? users : fallback;
}

function normalizeCurrentUserId(value: unknown, users: AuthUser[], fallback: string) {
  return typeof value === "string" && users.some((user) => user.id === value) ? value : fallback;
}

function isAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== "object") return false;
  const user = value as Partial<AuthUser>;

  return (
    typeof user.id === "string" &&
    typeof user.name === "string" &&
    (user.role === "student" || user.role === "professor")
  );
}

function normalizeAssignment(value: unknown, fallback: Assignment): Assignment {
  if (!value || typeof value !== "object") return fallback;
  const assignment = value as Partial<Assignment>;

  return {
    id: typeof assignment.id === "string" && assignment.id ? migrateLegacyId(assignment.id) : fallback.id,
    title: typeof assignment.title === "string" && assignment.title ? assignment.title : fallback.title,
    prompt: typeof assignment.prompt === "string" && assignment.prompt ? assignment.prompt : fallback.prompt
  };
}

function normalizeSubmission(
  value: unknown,
  assignmentId: string,
  fallback: StoredSubmission
): StoredSubmission {
  if (!value || typeof value !== "object") return { ...fallback, assignmentId };
  const submission = value as Partial<StoredSubmission>;

  return {
    id: typeof submission.id === "string" && submission.id ? migrateLegacyId(submission.id) : fallback.id,
    assignmentId,
    studentId: typeof submission.studentId === "string" && submission.studentId ? migrateLegacyId(submission.studentId) : fallback.studentId,
    paperText: typeof submission.paperText === "string" ? submission.paperText : fallback.paperText,
    events: Array.isArray(submission.events) ? submission.events : fallback.events,
    snapshots: Array.isArray(submission.snapshots) && submission.snapshots.length ? submission.snapshots : fallback.snapshots,
    submittedText: typeof submission.submittedText === "string" ? submission.submittedText : fallback.submittedText,
    summaryText: typeof submission.summaryText === "string" ? submission.summaryText : fallback.summaryText,
    submittedAt: typeof submission.submittedAt === "number" ? submission.submittedAt : null,
    summaryCompletedAt: typeof submission.summaryCompletedAt === "number" ? submission.summaryCompletedAt : null,
    updatedAt: typeof submission.updatedAt === "number" ? submission.updatedAt : fallback.updatedAt
  };
}

function migrateLegacyId(value: unknown) {
  if (value === "student-demo") return DEMO_STUDENT_ID;
  if (value === "professor-demo") return DEMO_PROFESSOR_ID;
  if (value === "assignment-process-evidence") return DEMO_ASSIGNMENT_ID;
  if (value === "submission-demo-student") return DEMO_SUBMISSION_ID;
  return typeof value === "string" ? value : "";
}
