"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type MutableRefObject, type ReactNode } from "react";
import {
  activeWritingMs,
  analyzeProcess,
  countWords,
  formatDuration,
  getDiff,
  type Observation,
  type SessionMetrics,
  type Snapshot,
  type WritingEvent
} from "@/lib/writing-events";
import type { Assignment, AuthUser, UserRole } from "@/lib/persistence";
import type { ReplayFrame } from "@/lib/replay";
import { comparisonToObservations, type SummaryComparison } from "@/lib/summary-comparison";
import type {
  AppendWritingEventBody,
  AssignmentRosterResponse,
  AssignmentSubmissionListResponse,
  CreateProfessorAssignmentBody,
  CreateProfessorAssignmentResponse,
  EnrollAssignmentStudentBody,
  LockSubmissionBody,
  ProfessorAssignmentListResponse,
  ProfessorReportResponse,
  ReplayRequestBody,
  RemoveAssignmentStudentBody,
  SessionMetricsResponse,
  StudentAssignmentListResponse,
  StudentSessionResponse,
  SummaryComparisonRequestBody,
  TimedSummaryBody
} from "@/lib/server-boundaries";

type AccessState = "loading" | "authenticated" | "unauthenticated" | "forbidden" | "error";

type StudentState = {
  assignment: Assignment;
  sessionId: string;
  paperText: string;
  events: WritingEvent[];
  snapshots: Snapshot[];
  submittedText: string;
  summaryText: string;
  submittedAt: number | null;
  lockedAt: number | null;
  summaryCompletedAt: number | null;
  status: string;
};

type ProfessorAssignment = ProfessorAssignmentListResponse["assignments"][number];
type ProfessorSubmission = AssignmentSubmissionListResponse["submissions"][number];
type AssignmentRosterStudent = AssignmentRosterResponse["students"][number];
type StudentAssignment = StudentAssignmentListResponse["assignments"][number];
type TextFormatKind = "bold" | "italic" | "underline";

type ProfessorState = {
  assignments: ProfessorAssignment[];
  assignmentsLoading: boolean;
  assignmentsError: string;
  assignmentCreateLoading: boolean;
  assignmentCreateError: string;
  selectedAssignmentId: string;
  roster: AssignmentRosterStudent[];
  rosterLoading: boolean;
  rosterError: string;
  enrollmentLoading: boolean;
  enrollmentError: string;
  submissions: ProfessorSubmission[];
  submissionsLoading: boolean;
  submissionsError: string;
  selectedSessionId: string;
  report: ProfessorReportResponse | null;
  reportLoading: boolean;
  reportError: string;
};

const initialProfessorState: ProfessorState = {
  assignments: [],
  assignmentsLoading: false,
  assignmentsError: "",
  assignmentCreateLoading: false,
  assignmentCreateError: "",
  selectedAssignmentId: "",
  roster: [],
  rosterLoading: false,
  rosterError: "",
  enrollmentLoading: false,
  enrollmentError: "",
  submissions: [],
  submissionsLoading: false,
  submissionsError: "",
  selectedSessionId: "",
  report: null,
  reportLoading: false,
  reportError: ""
};

type WorkspaceClientProps = {
  requiredRole?: UserRole;
  professorDetailMode?: boolean;
  initialProfessorAssignmentId?: string;
  initialProfessorSessionId?: string;
};

export default function WorkspaceClient({
  requiredRole,
  professorDetailMode = false,
  initialProfessorAssignmentId = "",
  initialProfessorSessionId = ""
}: WorkspaceClientProps) {
  const router = useRouter();
  const [accessState, setAccessState] = useState<AccessState>("loading");
  const [accessMessage, setAccessMessage] = useState("");
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [signInLoading, setSignInLoading] = useState<UserRole | null>(null);
  const [signInError, setSignInError] = useState("");
  const [signInForm, setSignInForm] = useState({ username: "", password: "" });
  const [signOutLoading, setSignOutLoading] = useState(false);
  const [studentState, setStudentState] = useState<StudentState | null>(null);
  const [studentAssignments, setStudentAssignments] = useState<StudentAssignment[]>([]);
  const [studentAssignmentsLoading, setStudentAssignmentsLoading] = useState(false);
  const [studentAssignmentsError, setStudentAssignmentsError] = useState("");
  const [studentLoading, setStudentLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [studentError, setStudentError] = useState("");
  const [professorState, setProfessorState] = useState<ProfessorState>(() => ({
    ...initialProfessorState,
    selectedAssignmentId: initialProfessorAssignmentId,
    selectedSessionId: initialProfessorSessionId
  }));
  const [assignmentForm, setAssignmentForm] = useState({ title: "", prompt: "", dueAt: "" });
  const [enrollmentForm, setEnrollmentForm] = useState({ displayName: "", email: "" });
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [remainingSeconds, setRemainingSeconds] = useState(120);
  const [replayFrames, setReplayFrames] = useState<ReplayFrame[]>([]);
  const [sessionMetrics, setSessionMetrics] = useState<SessionMetrics | null>(null);
  const [comparison, setComparison] = useState<SummaryComparison | null>(null);
  const [serverSyncError, setServerSyncError] = useState("");
  const [replayIndex, setReplayIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const summaryStartedAtRef = useRef<number | null>(null);

  const lastTextRef = useRef("");
  const lastInputAtRef = useRef<number | null>(null);
  const pendingInputTypeRef = useRef("unknown");
  const pendingPasteRef = useRef<{ words: number } | null>(null);
  const summaryDraftRef = useRef("");
  const summaryTimerRef = useRef<number | null>(null);
  const replayTimerRef = useRef<number | null>(null);
  const mutationQueueRef = useRef(Promise.resolve(true));

  const activeRole = currentUser?.role;
  const showWorkspaceNavLinks = !currentUser;
  const workspaceRole = requiredRole ?? activeRole;

  const handleAccessError = useCallback((status: number, fallback: string) => {
    if (status === 401) {
      setAccessState("unauthenticated");
      setAccessMessage("Sign in is required to continue.");
      return;
    }

    if (status === 403) {
      setAccessState("forbidden");
      setAccessMessage("You do not have access to this workspace.");
      return;
    }

    setAccessState("error");
    setAccessMessage(fallback);
  }, []);

  const apiGet = useCallback(async <T,>(path: string): Promise<T> => {
    const response = await fetch(path);
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const message = readApiError(data, "Request failed.");
      handleAccessError(response.status, message);
      const error = new Error(message);
      error.name = "ApiStatusError";
      throw error;
    }
    return response.json() as Promise<T>;
  }, [handleAccessError]);

  const loadStudentAssignments = useCallback(async () => {
    setStudentAssignmentsLoading(true);
    setStudentAssignmentsError("");

    try {
      const data = await apiGet<StudentAssignmentListResponse>("/api/assignments");
      setStudentAssignments(data.assignments);
      return data.assignments;
    } catch (error) {
      setStudentAssignments([]);
      setStudentAssignmentsError(error instanceof Error ? error.message : "Assignments failed to load.");
      return [];
    } finally {
      setStudentAssignmentsLoading(false);
    }
  }, [apiGet]);

  const hydrateStudent = useCallback(async (assignmentId?: string) => {
    setStudentLoading(true);
    setStudentError("");

    try {
      const query = assignmentId ? `?assignmentId=${encodeURIComponent(assignmentId)}` : "";
      const data = await apiGet<StudentSessionResponse>(`/api/assignments/current${query}`);
      const nextState = studentSessionToState(data);
      setStudentState(nextState);
      lastTextRef.current = nextState.paperText;
      setReplayIndex(0);
      setServerSyncError("");
      setAccessState("authenticated");
      void loadStudentAssignments();
    } catch (error) {
      setStudentState(null);
      setStudentError(error instanceof Error ? error.message : "Student session failed to load.");
    } finally {
      setStudentLoading(false);
    }
  }, [apiGet, loadStudentAssignments]);

  const loadProfessorAssignments = useCallback(async () => {
    setProfessorState((current) => ({
      ...current,
      assignmentsLoading: true,
      assignmentsError: "",
      assignmentCreateError: "",
      roster: [],
      submissions: [],
      report: null
    }));

    try {
      const data = await apiGet<ProfessorAssignmentListResponse>("/api/professor/assignments");
      setProfessorState((current) => ({
        ...current,
        assignments: data.assignments,
        assignmentsLoading: false,
        selectedAssignmentId:
          data.assignments.find((assignment) => assignment.id === current.selectedAssignmentId)?.id
          ?? data.assignments.find((assignment) => assignment.id === initialProfessorAssignmentId)?.id
          ?? data.assignments[0]?.id
          ?? "",
        assignmentsError: ""
      }));
      setAccessState("authenticated");
    } catch (error) {
      setProfessorState((current) => ({
        ...current,
        assignments: [],
        assignmentsLoading: false,
        assignmentsError: error instanceof Error ? error.message : "Assignments failed to load."
      }));
    }
  }, [apiGet, initialProfessorAssignmentId]);

  async function createAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfessorState((current) => ({ ...current, assignmentCreateLoading: true, assignmentCreateError: "" }));

    const request: CreateProfessorAssignmentBody = {
      title: assignmentForm.title,
      prompt: assignmentForm.prompt,
      dueAt: assignmentForm.dueAt ? new Date(`${assignmentForm.dueAt}T23:59:00`).getTime() : null
    };

    try {
      const response = await fetch("/api/professor/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        handleAccessError(response.status, readApiError(data, "Assignment creation failed."));
        throw new Error(readApiError(data, "Assignment creation failed."));
      }

      const assignment = (data as CreateProfessorAssignmentResponse).assignment;
      setProfessorState((current) => ({
        ...current,
        assignments: [assignment, ...current.assignments],
        selectedAssignmentId: assignment.id,
        assignmentCreateLoading: false,
        assignmentCreateError: "",
        roster: [],
        submissions: [],
        selectedSessionId: "",
        report: null
      }));
      setAssignmentForm({ title: "", prompt: "", dueAt: "" });
    } catch (error) {
      setProfessorState((current) => ({
        ...current,
        assignmentCreateLoading: false,
        assignmentCreateError: error instanceof Error ? error.message : "Assignment creation failed."
      }));
    }
  }

  const hydrateUserWorkspace = useCallback(async (user: AuthUser) => {
    setCurrentUser(user);
    setAccessState("authenticated");
    setAccessMessage("");
    setSignInError("");
    if (requiredRole && user.role !== requiredRole) {
      setAccessState("forbidden");
      setAccessMessage(`This is the ${formatRole(requiredRole).toLowerCase()} portal. Sign out and use a ${formatRole(requiredRole).toLowerCase()} account to continue.`);
      return;
    }
    if (user.role === "student") {
      const assignments = await loadStudentAssignments();
      await hydrateStudent(assignments[0]?.id);
    } else {
      await loadProfessorAssignments();
    }
  }, [hydrateStudent, loadProfessorAssignments, loadStudentAssignments, requiredRole, router]);

  useEffect(() => {
    let alive = true;

    async function hydrateAuth() {
      setAccessState("loading");
      setAccessMessage("");

      try {
        const data = await apiGet<{ user: AuthUser }>("/api/auth/me");
        if (!alive) return;

        await hydrateUserWorkspace(data.user);
      } catch (error) {
        if (!alive) return;
        setCurrentUser(null);
        if (!(error instanceof Error) || error.name !== "ApiStatusError") {
          setAccessState("error");
          setAccessMessage(error instanceof Error ? error.message : "Authentication failed.");
        }
      }
    }

    void hydrateAuth();

    return () => {
      alive = false;
    };
  }, [apiGet, hydrateUserWorkspace]);

  async function signInWithCredentials(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const roleHint = signInForm.username.trim().toLowerCase() === "professor" ? "professor" : "student";
    setSignInLoading(roleHint);
    setSignInError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signInForm)
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readApiError(data, "Sign in failed."));
      await hydrateUserWorkspace((data as { user: AuthUser }).user);
    } catch (error) {
      setAccessState("unauthenticated");
      setAccessMessage("Sign in is required to continue.");
      setSignInError(error instanceof Error ? error.message : "Sign in failed.");
    } finally {
      setSignInLoading(null);
    }
  }

  async function signOut() {
    setSignOutLoading(true);

    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setCurrentUser(null);
      setStudentState(null);
      setStudentAssignments([]);
      setProfessorState({
        ...initialProfessorState,
        selectedAssignmentId: initialProfessorAssignmentId,
        selectedSessionId: initialProfessorSessionId
      });
      setAccessState("unauthenticated");
      setAccessMessage("Sign in is required to continue.");
      setSignOutLoading(false);
      router.push("/login");
    }
  }

  useEffect(() => {
    if (!professorState.selectedAssignmentId) {
      setProfessorState((current) => ({
        ...current,
        roster: [],
        submissions: [],
        selectedSessionId: "",
        report: null
      }));
      return;
    }

    const controller = new AbortController();
    setProfessorState((current) => ({
      ...current,
      submissionsLoading: true,
      submissionsError: "",
      submissions: [],
      report: null
    }));

    fetch(`/api/assignments/${encodeURIComponent(professorState.selectedAssignmentId)}/submissions`, {
      signal: controller.signal
    })
      .then((response) => response.ok
        ? response.json()
        : response.json().catch(() => ({})).then((data) => {
          handleAccessError(response.status, readApiError(data, "Submissions failed to load."));
          throw new Error(readApiError(data, "Submissions failed to load."));
        }))
      .then((data: AssignmentSubmissionListResponse) => {
        setProfessorState((current) => ({
          ...current,
          submissions: data.submissions,
          submissionsLoading: false,
          submissionsError: "",
          selectedSessionId:
            data.submissions.find((submission) => submission.sessionId === current.selectedSessionId)?.sessionId
            ?? data.submissions.find((submission) => submission.sessionId === initialProfessorSessionId)?.sessionId
            ?? data.submissions.find((submission) => submission.submittedAt && submission.sessionId)?.sessionId
            ?? data.submissions.find((submission) => submission.sessionId)?.sessionId
            ?? ""
        }));
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") {
          setProfessorState((current) => ({
            ...current,
            submissions: [],
            submissionsLoading: false,
            submissionsError: error.message
          }));
        }
      });

    return () => controller.abort();
  }, [handleAccessError, initialProfessorSessionId, professorState.selectedAssignmentId]);

  useEffect(() => {
    if (!professorState.selectedAssignmentId) return;

    const controller = new AbortController();
    setProfessorState((current) => ({
      ...current,
      rosterLoading: true,
      rosterError: "",
      roster: []
    }));

    fetch(`/api/professor/assignments/${encodeURIComponent(professorState.selectedAssignmentId)}/students`, {
      signal: controller.signal
    })
      .then((response) => response.ok
        ? response.json()
        : response.json().catch(() => ({})).then((data) => {
          handleAccessError(response.status, readApiError(data, "Roster failed to load."));
          throw new Error(readApiError(data, "Roster failed to load."));
        }))
      .then((data: AssignmentRosterResponse) => {
        setProfessorState((current) => ({
          ...current,
          roster: data.students,
          rosterLoading: false,
          rosterError: ""
        }));
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") {
          setProfessorState((current) => ({
            ...current,
            roster: [],
            rosterLoading: false,
            rosterError: error.message
          }));
        }
      });

    return () => controller.abort();
  }, [handleAccessError, professorState.selectedAssignmentId]);

  useEffect(() => {
    if (!professorState.selectedSessionId) {
      setProfessorState((current) => ({ ...current, report: null, reportError: "", reportLoading: false }));
      return;
    }

    const controller = new AbortController();
    setProfessorState((current) => ({ ...current, report: null, reportLoading: true, reportError: "" }));

    fetch(`/api/reports/${encodeURIComponent(professorState.selectedSessionId)}`, {
      signal: controller.signal
    })
      .then((response) => response.ok
        ? response.json()
        : response.json().catch(() => ({})).then((data) => {
          handleAccessError(response.status, readApiError(data, "Report failed to load."));
          throw new Error(readApiError(data, "Report failed to load."));
        }))
      .then((data: ProfessorReportResponse) => {
        setProfessorState((current) => ({
          ...current,
          report: data,
          reportLoading: false,
          reportError: ""
        }));
        setReplayIndex((current) => Math.min(current, Math.max(0, data.frames.length - 1)));
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") {
          setProfessorState((current) => ({
            ...current,
            report: null,
            reportLoading: false,
            reportError: error.message
          }));
        }
      });

    return () => controller.abort();
  }, [handleAccessError, professorState.selectedSessionId]);

  useEffect(() => {
    if (!studentState) {
      setReplayFrames([]);
      setSessionMetrics(null);
      return;
    }

    const controller = new AbortController();
    void loadStoredReplay(studentState.sessionId, controller.signal);
    void loadSessionMetrics(studentState.sessionId, controller.signal);

    return () => controller.abort();
  }, [studentState?.sessionId]);

  useEffect(() => {
    if (!studentState?.submittedText || !studentState.summaryText) {
      setComparison(null);
      return;
    }

    const controller = new AbortController();
    const request: SummaryComparisonRequestBody = { sessionId: studentState.sessionId };
    fetch("/api/summary-comparison", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Summary comparison failed.")))
      .then((data: SummaryComparison) => setComparison(data))
      .catch((error: Error) => {
        if (error.name !== "AbortError") setComparison(null);
      });

    return () => controller.abort();
  }, [studentState?.sessionId, studentState?.submittedText, studentState?.summaryText]);

  useEffect(() => {
    return () => {
      if (summaryTimerRef.current) window.clearInterval(summaryTimerRef.current);
      if (replayTimerRef.current) window.clearInterval(replayTimerRef.current);
    };
  }, []);

  const submitted = Boolean(studentState?.submittedAt || studentState?.lockedAt);
  const studentObservations = useMemo(() => {
    if (!studentState?.submittedText) return [];
    const items: Observation[] = analyzeProcess(studentState.events, studentState.submittedText);
    if (comparison) items.push(...comparisonToObservations(comparison));
    return items;
  }, [comparison, studentState]);

  const pasteCount = studentState?.events.filter((event) => event.type === "paste").length ?? 0;
  const deletionCount = studentState?.events.filter((event) => event.deletionEvent).length ?? 0;
  const observations = activeRole === "professor" ? professorState.report?.observations ?? [] : studentObservations;
  const evidenceTags = activeRole === "professor" ? professorState.report?.tags ?? [] : [];
  const behavioralRisk = activeRole === "professor" ? professorState.report?.behavioralRisk ?? null : null;
  const pasteEventCards = activeRole === "professor" ? professorState.report?.pasteEventCards ?? [] : [];
  const timelineMarkers = activeRole === "professor" ? professorState.report?.timelineMarkers ?? [] : [];
  const activeReplayFrames = activeRole === "professor" ? professorState.report?.frames ?? [] : replayFrames;
  const replayFrame = activeReplayFrames[replayIndex];

  function updateStudentState(updater: (current: StudentState) => StudentState) {
    setStudentState((current) => current ? updater(current) : current);
  }

  function recordEvent(event: Omit<WritingEvent, "id">) {
    const localEvent = {
      id: crypto.randomUUID(),
      ...event
    };

    updateStudentState((current) => ({
      ...current,
      events: [...current.events, localEvent]
    }));

    return localEvent;
  }

  function handlePaperChange(nextText: string) {
    if (!studentState || submitted) return;

    const now = Date.now();
    const previousText = lastTextRef.current;
    const diff = getDiff(previousText, nextText);
    const pasted = pendingPasteRef.current;
    const eventType = pasted ? "paste" : diff.added ? "insert" : "delete";

    const event = recordEvent({
      type: eventType,
      at: now,
      inputType: pendingInputTypeRef.current,
      start: diff.start,
      removed: diff.removed,
      added: diff.added,
      removedCharacters: diff.removed.length,
      addedWords: countWords(diff.added),
      removedWords: countWords(diff.removed),
      durationSincePreviousMs: lastInputAtRef.current ? now - lastInputAtRef.current : 0,
      pasteWords: pasted ? pasted.words : 0,
      deletionEvent: !pasted && diff.removed.length > 2
    });
    void persistWritingEvent(event);

    pendingPasteRef.current = null;
    pendingInputTypeRef.current = "unknown";
    lastInputAtRef.current = now;
    lastTextRef.current = nextText;
    updateStudentState((current) => ({
      ...current,
      paperText: nextText,
      snapshots: [...current.snapshots, { at: now, text: nextText }]
    }));
  }

  async function submitPaper() {
    if (!studentState || submitted || submitLoading) return;

    setSubmitLoading(true);

    const now = Date.now();
    const submitEvent = recordEvent({
      type: "submit",
      at: now,
      words: countWords(studentState.paperText)
    });
    const snapshot = { at: now, text: studentState.paperText };
    await persistWritingEvent(submitEvent);
    const locked = await lockSubmittedPaper(studentState.paperText, snapshot);
    if (!locked) {
      setSubmitLoading(false);
      return;
    }

    updateStudentState((current) => ({
      ...current,
      submittedText: current.paperText,
      submittedAt: now,
      lockedAt: now,
      status: "submitted",
      snapshots: [...current.snapshots, snapshot]
    }));
    summaryDraftRef.current = "";
    summaryStartedAtRef.current = now;
    setSummaryDraft("");
    setRemainingSeconds(120);
    setSummaryOpen(true);
    startSummaryTimer();
    setSubmitLoading(false);
  }

  function startSummaryTimer() {
    if (summaryTimerRef.current) window.clearInterval(summaryTimerRef.current);
    summaryTimerRef.current = window.setInterval(() => {
      setRemainingSeconds((current) => {
        if (current <= 1) {
          completeSummary();
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  }

  function completeSummary() {
    if (!studentState) return;

    if (summaryTimerRef.current) window.clearInterval(summaryTimerRef.current);
    summaryTimerRef.current = null;
    const completedAt = Date.now();
    void storeSummary(summaryDraftRef.current, summaryStartedAtRef.current || completedAt, completedAt);
    updateStudentState((current) => ({
      ...current,
      summaryText: summaryDraftRef.current,
      summaryCompletedAt: completedAt
    }));
    setSummaryOpen(false);
  }

  function selectAssignment(assignmentId: string) {
    setProfessorState((current) => ({
      ...current,
      selectedAssignmentId: assignmentId,
      selectedSessionId: "",
      report: null
    }));
  }

  function selectSession(sessionId: string) {
    setProfessorState((current) => ({
      ...current,
      selectedSessionId: sessionId,
      report: null
    }));
    setReplayIndex(0);
  }

  function selectStudentAssignment(assignmentId: string) {
    setComparison(null);
    setReplayFrames([]);
    setReplayIndex(0);
    summaryDraftRef.current = "";
    summaryStartedAtRef.current = null;
    lastInputAtRef.current = null;
    pendingInputTypeRef.current = "unknown";
    pendingPasteRef.current = null;
    void hydrateStudent(assignmentId);
  }

  async function enrollStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!professorState.selectedAssignmentId || professorState.enrollmentLoading) return;

    setProfessorState((current) => ({ ...current, enrollmentLoading: true, enrollmentError: "" }));
    const request: EnrollAssignmentStudentBody = {
      displayName: enrollmentForm.displayName,
      email: enrollmentForm.email
    };

    try {
      const response = await fetch(`/api/professor/assignments/${encodeURIComponent(professorState.selectedAssignmentId)}/students`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        handleAccessError(response.status, readApiError(data, "Enrollment failed."));
        throw new Error(readApiError(data, "Enrollment failed."));
      }

      const student = (data as { student: AssignmentRosterStudent }).student;
      setProfessorState((current) => ({
        ...current,
        roster: [...current.roster, student],
        submissions: [...current.submissions, {
          sessionId: null,
          studentId: student.studentId,
          studentName: student.studentName,
          studentEmail: student.studentEmail,
          status: "not_started",
          submittedAt: null,
          lockedAt: null,
          attemptNumber: null
        }],
        enrollmentLoading: false,
        enrollmentError: ""
      }));
      setEnrollmentForm({ displayName: "", email: "" });
    } catch (error) {
      setProfessorState((current) => ({
        ...current,
        enrollmentLoading: false,
        enrollmentError: error instanceof Error ? error.message : "Enrollment failed."
      }));
    }
  }

  async function removeStudent(studentId: string) {
    if (!professorState.selectedAssignmentId || professorState.enrollmentLoading) return;

    setProfessorState((current) => ({ ...current, enrollmentLoading: true, enrollmentError: "" }));
    const request: RemoveAssignmentStudentBody = { studentId };

    try {
      const response = await fetch(`/api/professor/assignments/${encodeURIComponent(professorState.selectedAssignmentId)}/students`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        handleAccessError(response.status, readApiError(data, "Roster update failed."));
        throw new Error(readApiError(data, "Roster update failed."));
      }

      setProfessorState((current) => ({
        ...current,
        roster: current.roster.filter((student) => student.studentId !== studentId),
        submissions: current.submissions.filter((submission) => submission.studentId !== studentId),
        selectedSessionId: current.submissions.some((submission) => (
          submission.studentId === studentId && submission.sessionId === current.selectedSessionId
        )) ? "" : current.selectedSessionId,
        enrollmentLoading: false,
        enrollmentError: ""
      }));
    } catch (error) {
      setProfessorState((current) => ({
        ...current,
        enrollmentLoading: false,
        enrollmentError: error instanceof Error ? error.message : "Roster update failed."
      }));
    }
  }

  function playReplay() {
    if (replayTimerRef.current) {
      window.clearInterval(replayTimerRef.current);
      replayTimerRef.current = null;
      setIsPlaying(false);
      return;
    }

    setReplayIndex(0);
    setIsPlaying(true);
    replayTimerRef.current = window.setInterval(() => {
      setReplayIndex((current) => {
        const next = current + 1;
        if (next > activeReplayFrames.length - 1) {
          if (replayTimerRef.current) window.clearInterval(replayTimerRef.current);
          replayTimerRef.current = null;
          setIsPlaying(false);
          return current;
        }
        return next;
      });
    }, 240);
  }

  function persistWritingEvent(event: WritingEvent) {
    if (!studentState) return Promise.resolve(false);

    const { id: _id, ...eventPayload } = event;
    const sessionId = studentState.sessionId;
    const request: AppendWritingEventBody = {
      sessionId,
      event: eventPayload
    };

    return enqueueMutation("/api/writing-events", request).then((ok) => {
      if (ok) {
        void loadStoredReplay(sessionId);
        void loadSessionMetrics(sessionId);
      }
      return ok;
    });
  }

  function lockSubmittedPaper(submittedTextForLock: string, snapshot: Snapshot) {
    if (!studentState) return Promise.resolve(false);

    const sessionId = studentState.sessionId;
    const request: LockSubmissionBody = {
      sessionId,
      submittedText: submittedTextForLock,
      snapshot
    };

    return enqueueMutation("/api/submissions/lock", request).then((ok) => {
      if (ok) {
        void loadStoredReplay(sessionId);
        void loadSessionMetrics(sessionId);
      }
      return ok;
    });
  }

  function storeSummary(summaryTextForStorage: string, startedAt: number, completedAt: number) {
    if (!studentState) return Promise.resolve(false);

    const sessionId = studentState.sessionId;
    const request: TimedSummaryBody = {
      sessionId,
      startedAt,
      completedAt,
      summaryText: summaryTextForStorage
    };

    return enqueueMutation("/api/timed-summaries", request).then((ok) => {
      if (ok) void loadStoredSummaryComparison(sessionId);
      return ok;
    });
  }

  function loadStoredReplay(sessionId: string, signal?: AbortSignal) {
    const request: ReplayRequestBody = { sessionId };
    return fetch("/api/replay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Replay reconstruction failed.")))
      .then((data: { frames: ReplayFrame[] }) => {
        setReplayFrames(data.frames);
        setReplayIndex((current) => Math.min(current, Math.max(0, data.frames.length - 1)));
        return true;
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setReplayFrames([]);
        return false;
      });
  }

  function loadSessionMetrics(sessionId: string, signal?: AbortSignal) {
    return fetch(`/api/sessions/${encodeURIComponent(sessionId)}/metrics`, { signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Session metrics failed.")))
      .then((data: SessionMetricsResponse) => {
        setSessionMetrics(data.metrics);
        return true;
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setSessionMetrics(null);
        return false;
      });
  }

  function loadStoredSummaryComparison(sessionId: string) {
    const request: SummaryComparisonRequestBody = { sessionId };
    return fetch("/api/summary-comparison", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request)
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Summary comparison failed.")))
      .then((data: SummaryComparison) => {
        setComparison(data);
        return true;
      })
      .catch(() => false);
  }

  function enqueueMutation(path: string, body: unknown) {
    const nextMutation = mutationQueueRef.current.then(() => postMutation(path, body));
    mutationQueueRef.current = nextMutation.catch(() => false);
    return nextMutation;
  }

  async function postMutation(path: string, body: unknown) {
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "Server mutation failed." }));
        handleAccessError(response.status, readApiError(data, "Server mutation failed."));
        throw new Error(readApiError(data, "Server mutation failed."));
      }

      setServerSyncError("");
      return true;
    } catch (error) {
      setServerSyncError(error instanceof Error ? error.message : "Server mutation failed.");
      return false;
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="brand-block">
          <p className="eyebrow">AuthorCheck</p>
          <h1>{workspaceRole === "professor" ? "Professor evidence workspace" : "Student writing workspace"}</h1>
        </div>
        <nav className="product-nav" aria-label="Primary navigation">
          <Link href="/">Home</Link>
          {showWorkspaceNavLinks ? (
            <>
              <Link href="/student" aria-current={requiredRole === "student" ? "page" : undefined}>Student</Link>
              <Link href="/professor" aria-current={requiredRole === "professor" ? "page" : undefined}>Professor</Link>
            </>
          ) : null}
        </nav>
        <div className="account-bar" aria-live="polite">
          {currentUser ? (
            <>
              <p className="account-name">{currentUser.name}</p>
              <div className="account-row">
                <p className="account-role">{formatRole(currentUser.role)}</p>
                <button className="text-button" disabled={signOutLoading} onClick={signOut}>
                  {signOutLoading ? "Signing out..." : "Sign out"}
                </button>
              </div>
            </>
          ) : (
            <div className="account-row">
              <Link className="text-link" href="/login">Log in</Link>
              <Link className="ghost compact" href="/signup">Sign up</Link>
            </div>
          )}
        </div>
      </header>

      <main>
        {accessState === "loading" ? (
          <StatusPanel title="Loading session" message="Checking your signed-in session." />
        ) : accessState === "unauthenticated" ? (
          <StatusPanel title="Sign in" message="Use your workspace credentials.">
            <form className="signin-form" onSubmit={signInWithCredentials}>
              <label htmlFor="workspace-username">Email or username</label>
              <input
                id="workspace-username"
                autoComplete="username"
                value={signInForm.username}
                onChange={(event) => setSignInForm((current) => ({ ...current, username: event.target.value }))}
              />
              <label htmlFor="workspace-password">Password</label>
              <input
                id="workspace-password"
                autoComplete="current-password"
                type="password"
                value={signInForm.password}
                onChange={(event) => setSignInForm((current) => ({ ...current, password: event.target.value }))}
              />
              <div className="status-actions">
                <button className="primary" disabled={signInLoading !== null} type="submit">
                  {signInLoading ? "Signing in..." : "Sign in"}
                </button>
              </div>
            </form>
            {signInError ? <p className="sync-error">{signInError}</p> : null}
            {accessMessage ? <p className="note">{accessMessage}</p> : null}
          </StatusPanel>
        ) : accessState === "forbidden" ? (
          <StatusPanel title="Access denied" message={accessMessage} />
        ) : accessState === "error" && !currentUser ? (
          <StatusPanel title="Could not load workspace" message={accessMessage} />
        ) : activeRole === "student" ? (
          <StudentView
            studentState={studentState}
            assignments={studentAssignments}
            assignmentsLoading={studentAssignmentsLoading}
            assignmentsError={studentAssignmentsError}
            loading={studentLoading}
            submitLoading={submitLoading}
            error={studentError}
            submitted={submitted}
            sessionMetrics={sessionMetrics}
            pasteCount={pasteCount}
            deletionCount={deletionCount}
            serverSyncError={serverSyncError}
            replayFrame={replayFrame}
            replayIndex={replayIndex}
            activeReplayFrames={activeReplayFrames}
            isPlaying={isPlaying}
            onSubmit={submitPaper}
            onSelectAssignment={selectStudentAssignment}
            onChange={handlePaperChange}
            onReplayIndexChange={setReplayIndex}
            onPlayReplay={playReplay}
            pendingInputTypeRef={pendingInputTypeRef}
            pendingPasteRef={pendingPasteRef}
          />
        ) : (
          <ProfessorView
            professorState={professorState}
            assignmentForm={assignmentForm}
            enrollmentForm={enrollmentForm}
            professorDetailMode={professorDetailMode}
            observations={observations}
            evidenceTags={evidenceTags}
            behavioralRisk={behavioralRisk}
            pasteEventCards={pasteEventCards}
            timelineMarkers={timelineMarkers}
            replayFrame={replayFrame}
            replayIndex={replayIndex}
            activeReplayFrames={activeReplayFrames}
            isPlaying={isPlaying}
            onSelectAssignment={selectAssignment}
            onSelectSession={selectSession}
            onAssignmentFormChange={setAssignmentForm}
            onEnrollmentFormChange={setEnrollmentForm}
            onCreateAssignment={createAssignment}
            onEnrollStudent={enrollStudent}
            onRemoveStudent={removeStudent}
            onReplayIndexChange={setReplayIndex}
            onPlayReplay={playReplay}
          />
        )}
      </main>

      {summaryOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section className="dialog-card modal" role="dialog" aria-modal="true" aria-labelledby="summary-title">
            <div>
              <p className="eyebrow">Comprehension Check</p>
              <h2 id="summary-title">Complete the post-submission quiz</h2>
              <p className="note">
                You have <span>{formatTimer(remainingSeconds)}</span>. Explain the main argument, key claims, and evidence from memory.
              </p>
            </div>
            <textarea
              id="summary-editor"
              placeholder="Main argument, key claims, evidence, and limitation..."
              value={summaryDraft}
              onChange={(event) => {
                summaryDraftRef.current = event.target.value;
                setSummaryDraft(event.target.value);
              }}
            />
            <button className="primary" onClick={completeSummary}>Submit Quiz</button>
          </section>
        </div>
      ) : null}
    </>
  );
}

function StudentView({
  studentState,
  assignments,
  assignmentsLoading,
  assignmentsError,
  loading,
  submitLoading,
  error,
  submitted,
  sessionMetrics,
  pasteCount,
  deletionCount,
  serverSyncError,
  replayFrame,
  replayIndex,
  activeReplayFrames,
  isPlaying,
  onSubmit,
  onSelectAssignment,
  onChange,
  onReplayIndexChange,
  onPlayReplay,
  pendingInputTypeRef,
  pendingPasteRef
}: {
  studentState: StudentState | null;
  assignments: StudentAssignment[];
  assignmentsLoading: boolean;
  assignmentsError: string;
  loading: boolean;
  submitLoading: boolean;
  error: string;
  submitted: boolean;
  sessionMetrics: SessionMetrics | null;
  pasteCount: number;
  deletionCount: number;
  serverSyncError: string;
  replayFrame: ReplayFrame | undefined;
  replayIndex: number;
  activeReplayFrames: ReplayFrame[];
  isPlaying: boolean;
  onSubmit: () => void;
  onSelectAssignment: (assignmentId: string) => void;
  onChange: (nextText: string) => void;
  onReplayIndexChange: (index: number) => void;
  onPlayReplay: () => void;
  pendingInputTypeRef: MutableRefObject<string>;
  pendingPasteRef: MutableRefObject<{ words: number } | null>;
}) {
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const completedAssignments = assignments.filter((assignment) => assignment.submittedAt).length;
  const progressPercent = assignments.length ? Math.round((completedAssignments / assignments.length) * 100) : 0;
  const upcomingAssignments = assignments.filter((assignment) => !assignment.submittedAt).slice(0, 3);
  const dueDateConflicts = findDueDateConflicts(assignments);

  function applyFormat(kind: TextFormatKind) {
    if (!studentState || submitted || !editorRef.current) return;

    const textarea = editorRef.current;
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const nextState = formatSelectedText(studentState.paperText, selectionStart, selectionEnd, kind);
    onChange(nextState.text);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextState.selectionStart, nextState.selectionEnd);
    });
  }

  if (loading) return <StatusPanel title="Loading assignment" message="Hydrating your draft from the database." />;
  if (error) return <StatusPanel title="Assignment unavailable" message={error} />;
  if (!studentState) return <StatusPanel title="No assignment" message="No active writing session was returned." />;

  return (
    <section className="view active classroom-dashboard">
      <section className="course-banner student-banner">
        <div>
          <p className="course-label">Current assignment</p>
          <h2>{studentState.assignment.title}</h2>
          <p>{studentState.assignment.prompt}</p>
        </div>
        <div className="course-banner-actions">
          <span>{submitted ? "Submitted" : "Draft in progress"}</span>
          <button className="primary" disabled={submitted || submitLoading} onClick={onSubmit}>
            {submitLoading ? "Submitting..." : "Submit Paper"}
          </button>
        </div>
      </section>

      <section className="student-dashboard-grid">
        <section className="panel classroom-card quick-actions-card">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Quick Actions</p>
              <h2>Student Dashboard</h2>
            </div>
          </div>
          <div className="quick-action-list">
            <a className="quick-action active" href="#paper-editor">
              <span>Continue writing</span>
              <strong>{countWords(studentState.paperText)} words</strong>
            </a>
            <button className="quick-action" disabled={submitted || submitLoading} onClick={onSubmit} type="button">
              <span>Final review</span>
              <strong>{submitted ? "Submitted" : "Ready when you are"}</strong>
            </button>
            <a className="quick-action" href="#student-replay-slider">
              <span>Recent feedback</span>
              <strong>{studentState.summaryCompletedAt ? "Quiz complete" : "No returned feedback"}</strong>
            </a>
          </div>
        </section>

        <section className="panel classroom-card calendar-card">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Calendar</p>
              <h2>Due Dates</h2>
            </div>
            {dueDateConflicts ? <span className="status-pill warning">Conflict</span> : <span className="status-pill">Clear</span>}
          </div>
          <div className="calendar-list">
            {upcomingAssignments.length ? upcomingAssignments.map((assignment) => (
              <button
                className={assignment.id === studentState.assignment.id ? "calendar-item active" : "calendar-item"}
                key={assignment.id}
                onClick={() => onSelectAssignment(assignment.id)}
                type="button"
              >
                <span>{assignment.dueAt ? new Date(assignment.dueAt).toLocaleDateString() : "No due date"}</span>
                <strong>{assignment.title}</strong>
              </button>
            )) : <div className="report-empty">No upcoming assignments.</div>}
          </div>
        </section>

        <section className="panel classroom-card progress-card">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Classes</p>
              <h2>Progress</h2>
            </div>
          </div>
          <div className="progress-ring" style={{ "--progress": `${progressPercent}%` } as CSSProperties}>
            <strong>{progressPercent}%</strong>
            <span>Complete</span>
          </div>
          <p className="note">{assignments.length ? `${completedAssignments} of ${assignments.length} assignments submitted.` : "No classwork assigned yet."}</p>
        </section>
      </section>

      <section className="student-assignment-shell">
        <section className="panel classroom-card">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Class Cards</p>
              <h2>Assigned Work</h2>
            </div>
          </div>
          {assignmentsLoading ? (
            <div className="report-empty">Loading assignments...</div>
          ) : assignmentsError ? (
            <div className="report-empty">{assignmentsError}</div>
          ) : assignments.length ? (
            <div className="select-list" aria-label="Choose Assignment">
              {assignments.map((assignment) => (
                <button
                  className={assignment.id === studentState.assignment.id ? "list-button active" : "list-button"}
                  key={assignment.id}
                  onClick={() => onSelectAssignment(assignment.id)}
                  type="button"
                >
                  <span>{assignment.title}{assignment.submittedAt ? "" : " · New"}</span>
                  <small>{formatAssignmentMeta(assignment)}</small>
                </button>
              ))}
            </div>
          ) : (
            <div className="report-empty">No assignments have been assigned yet.</div>
          )}
        </section>
      </section>

      <section className="flow-strip" aria-label="Writing flow">
        <span className="flow-step active">Write</span>
        <span className={activeReplayFrames.length ? "flow-step active" : "flow-step"}>Replay</span>
        <span className={submitted ? "flow-step active" : "flow-step"}>Submit</span>
        <span className={studentState.summaryCompletedAt ? "flow-step active" : "flow-step"}>Summary</span>
      </section>

      <section className="assignment classroom-card">
        <div>
          <p className="eyebrow">Instructions</p>
          <h2>{studentState.assignment.prompt}</h2>
        </div>
        <div className="assignment-actions">
          <button className="primary" disabled={submitted || submitLoading} onClick={onSubmit}>
            {submitLoading ? "Submitting..." : "Submit Paper"}
          </button>
        </div>
      </section>

      <section className="workspace">
        <aside className="panel classroom-card">
          <div className="panel-header compact">
            <div>
              <p className="eyebrow">Session</p>
              <h3>Live Capture</h3>
            </div>
            <span className="status-pill">{submitted ? "Locked" : "Recording"}</span>
          </div>
          <dl className="metrics">
            <div><dt>Words</dt><dd>{sessionMetrics?.finalWordCount ?? countWords(studentState.paperText)}</dd></div>
            <div><dt>Active Time</dt><dd>{formatDuration(sessionMetrics?.activeWritingMs ?? activeWritingMs(studentState.events))}</dd></div>
            <div><dt>Paste Events</dt><dd>{sessionMetrics?.pasteEvents ?? pasteCount}</dd></div>
            <div><dt>Deletion Events</dt><dd>{sessionMetrics?.deletionEvents ?? deletionCount}</dd></div>
          </dl>
          {serverSyncError ? <p className="sync-error">{serverSyncError}</p> : null}
          {studentState.summaryCompletedAt ? <p className="note">Timed summary complete. The paper remains locked.</p> : null}
          <p className="note">Writing events save automatically while you draft.</p>
        </aside>

        <div className="student-main">
          <section className="editor-shell classroom-card">
            <div className="editor-heading">
              <label htmlFor="paper-editor">Paper</label>
              <span>{submitted ? "Submitted" : "Draft"}</span>
            </div>
            <div className="editor-toolbar" aria-label="Text formatting">
              <button aria-label="Bold" className="toolbar-button" disabled={submitted} onClick={() => applyFormat("bold")} type="button">
                <strong>B</strong>
              </button>
              <button aria-label="Italic" className="toolbar-button" disabled={submitted} onClick={() => applyFormat("italic")} type="button">
                <em>I</em>
              </button>
              <button aria-label="Underline" className="toolbar-button" disabled={submitted} onClick={() => applyFormat("underline")} type="button">
                <span className="toolbar-underline">U</span>
              </button>
            </div>
            <div className="attachment-strip" aria-label="Attachment support">
              <label htmlFor="paper-attachments">Attachments</label>
              <input id="paper-attachments" disabled={submitted} multiple type="file" />
            </div>
            <textarea
              ref={editorRef}
              id="paper-editor"
              spellCheck
              placeholder="Start writing here..."
              disabled={submitted}
              value={studentState.paperText}
              onBeforeInput={(event) => {
                pendingInputTypeRef.current = event.nativeEvent.inputType || "unknown";
              }}
              onPaste={(event) => {
                pendingPasteRef.current = {
                  words: countWords(event.clipboardData.getData("text"))
                };
              }}
              onChange={(event) => onChange(event.target.value)}
            />
          </section>

          <section className="panel classroom-card final-review-card">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Final Review</p>
                <h2>Submission Confirmation</h2>
              </div>
              <span className="status-pill">{submitted ? "Locked" : "Draft"}</span>
            </div>
            <dl className="metrics compact-metrics">
              <div><dt>Words</dt><dd>{countWords(studentState.paperText)}</dd></div>
              <div><dt>Autosave</dt><dd>{serverSyncError ? "Issue" : "On"}</dd></div>
              <div><dt>Replay</dt><dd>{activeReplayFrames.length}</dd></div>
              <div><dt>Quiz</dt><dd>{studentState.summaryCompletedAt ? "Done" : "Next"}</dd></div>
            </dl>
            <button className="primary" disabled={submitted || submitLoading} onClick={onSubmit}>
              {submitLoading ? "Submitting..." : "Review and Submit"}
            </button>
          </section>

          <section className="panel replay-panel compact-replay classroom-card">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Process Replay</p>
                <h2>Rewind Draft History</h2>
              </div>
              <button className="ghost" disabled={!activeReplayFrames.length} onClick={onPlayReplay}>
                {isPlaying ? "Pause" : "Play"}
              </button>
            </div>
            <input
              id="student-replay-slider"
              type="range"
              min="0"
              max={Math.max(0, activeReplayFrames.length - 1)}
              value={replayIndex}
              onChange={(event) => onReplayIndexChange(Number(event.target.value))}
            />
            <div className="replay-output student-replay-output">
              {replayFrame ? `[${new Date(replayFrame.at).toLocaleTimeString()}] ${replayFrame.label}\n\n${replayFrame.text}` : "Writing events will appear here as the draft changes."}
            </div>
          </section>
        </div>
      </section>
    </section>
  );
}

function ProfessorView({
  professorState,
  assignmentForm,
  enrollmentForm,
  professorDetailMode,
  observations,
  evidenceTags,
  behavioralRisk,
  pasteEventCards,
  timelineMarkers,
  replayFrame,
  replayIndex,
  activeReplayFrames,
  isPlaying,
  onSelectAssignment,
  onSelectSession,
  onAssignmentFormChange,
  onEnrollmentFormChange,
  onCreateAssignment,
  onEnrollStudent,
  onRemoveStudent,
  onReplayIndexChange,
  onPlayReplay
}: {
  professorState: ProfessorState;
  assignmentForm: { title: string; prompt: string; dueAt: string };
  enrollmentForm: { displayName: string; email: string };
  professorDetailMode: boolean;
  observations: Observation[];
  evidenceTags: ProfessorReportResponse["tags"];
  behavioralRisk: ProfessorReportResponse["behavioralRisk"] | null;
  pasteEventCards: ProfessorReportResponse["pasteEventCards"];
  timelineMarkers: ProfessorReportResponse["timelineMarkers"];
  replayFrame: ReplayFrame | undefined;
  replayIndex: number;
  activeReplayFrames: ReplayFrame[];
  isPlaying: boolean;
  onSelectAssignment: (assignmentId: string) => void;
  onSelectSession: (sessionId: string) => void;
  onAssignmentFormChange: (form: { title: string; prompt: string; dueAt: string }) => void;
  onEnrollmentFormChange: (form: { displayName: string; email: string }) => void;
  onCreateAssignment: (event: FormEvent<HTMLFormElement>) => void;
  onEnrollStudent: (event: FormEvent<HTMLFormElement>) => void;
  onRemoveStudent: (studentId: string) => void;
  onReplayIndexChange: (index: number) => void;
  onPlayReplay: () => void;
}) {
  const [tagCategory, setTagCategory] = useState("all");
  const [tagSort, setTagSort] = useState("category");
  const tagCategories = useMemo(() => Array.from(new Set(evidenceTags.map((tag) => tag.category))).sort(), [evidenceTags]);
  const submittedCount = professorState.submissions.filter((submission) => submission.submittedAt).length;
  const readyCount = professorState.submissions.filter((submission) => submission.sessionId).length;
  const selectedAssignment = professorState.assignments.find((assignment) => assignment.id === professorState.selectedAssignmentId);
  const selectedSubmission = professorState.submissions.find((submission) => submission.sessionId === professorState.selectedSessionId);
  const reviewableSubmissions = professorState.submissions.filter((submission) => submission.sessionId && submission.submittedAt);
  const authorCheck = professorState.report?.authorCheck;
  const sortedEvidenceTags = useMemo(() => {
    const filtered = tagCategory === "all" ? evidenceTags : evidenceTags.filter((tag) => tag.category === tagCategory);
    return [...filtered].sort((a, b) => {
      if (tagSort === "time") return (a.at ?? Number.MAX_SAFE_INTEGER) - (b.at ?? Number.MAX_SAFE_INTEGER);
      if (tagSort === "label") return a.label.localeCompare(b.label);
      return `${a.category} ${a.label}`.localeCompare(`${b.category} ${b.label}`);
    });
  }, [evidenceTags, tagCategory, tagSort]);

  return (
    <section className="view active classroom-dashboard professor-dashboard">
      <section className="course-banner professor-banner">
        <div>
          <p className="course-label">{professorDetailMode ? "Submission review" : "Professor dashboard"}</p>
          <h2>
            {professorDetailMode
              ? selectedSubmission?.studentName ?? "Open a submitted assignment"
              : selectedAssignment?.title ?? "Choose a classwork item"}
          </h2>
          <p>
            {professorDetailMode
              ? selectedAssignment
                ? `${selectedAssignment.title}${selectedSubmission?.submittedAt ? ` · Submitted ${new Date(selectedSubmission.submittedAt).toLocaleDateString()}` : ""}`
                : "Load a submitted session to review neutral evidence."
              : selectedAssignment?.prompt ?? "Create an assignment or select one to review student writing evidence."}
          </p>
        </div>
        <dl className="course-stats">
          <div><dt>Students</dt><dd>{professorState.roster.length}</dd></div>
          <div><dt>Started</dt><dd>{readyCount}</dd></div>
          <div><dt>Submitted</dt><dd>{submittedCount}</dd></div>
        </dl>
      </section>
      {professorDetailMode ? (
        <>
          <section className="panel classroom-card professor-detail-nav">
            <div className="panel-header compact">
              <div>
                <p className="eyebrow">Back to dashboard</p>
                <h3>{selectedAssignment?.title ?? "Professor dashboard"}</h3>
              </div>
              <Link className="ghost compact" href="/professor">All classwork</Link>
            </div>
          </section>

          <section className="review-workbench">
            <section className="panel classroom-card submission-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Submission</p>
                  <h2>Submitted Paper</h2>
                </div>
                <span className="status-pill">Inline comments</span>
              </div>
              {professorState.reportLoading ? (
                <div className="report-empty">Loading submission...</div>
              ) : professorState.reportError ? (
                <div className="report-empty">{professorState.reportError}</div>
              ) : professorState.report ? (
                <>
                  <div className="text-evidence annotated-paper">{professorState.report.submittedText || "No submitted text returned."}</div>
                  <div className="inline-comment-list">
                    <article>
                      <strong>Comment 1</strong>
                      <p>Use inline notes here while reviewing process evidence and final text.</p>
                    </article>
                    <article>
                      <strong>Comment 2</strong>
                      <p>Source highlights are linked to paste events and replay markers.</p>
                    </article>
                  </div>
                </>
              ) : (
                <div className="report-empty">Open a submitted session to review the paper.</div>
              )}
            </section>

            <aside className="panel classroom-card algorithm-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">AuthorCheck System</p>
                  <h2>Algorithm Report</h2>
                </div>
                {professorState.selectedSessionId ? (
                  <div className="export-actions" aria-label="Export report">
                    <a className="ghost" href={`/api/reports/${encodeURIComponent(professorState.selectedSessionId)}/export?format=html`}>HTML</a>
                    <a className="ghost" href={`/api/reports/${encodeURIComponent(professorState.selectedSessionId)}/export?format=csv`}>CSV</a>
                    <a className="ghost" href={`/api/reports/${encodeURIComponent(professorState.selectedSessionId)}/export?format=pdf`}>PDF</a>
                  </div>
                ) : null}
              </div>
              {authorCheck ? (
                <>
                  <div className={`flag-summary ${authorCheck.flag}`}>
                    <div>
                      <span>{authorCheck.flagLabel}</span>
                      <strong>{authorCheck.similarityPercent}%</strong>
                    </div>
                    <p>{authorCheck.flagDetail}</p>
                  </div>
                  <div className="tag-toolbar" aria-label="Evidence tag controls">
                    <label htmlFor="tag-category">Tag</label>
                    <select id="tag-category" value={tagCategory} onChange={(event) => setTagCategory(event.target.value)}>
                      <option value="all">All tags</option>
                      {tagCategories.map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                    <label htmlFor="tag-sort">Sort</label>
                    <select id="tag-sort" value={tagSort} onChange={(event) => setTagSort(event.target.value)}>
                      <option value="category">Tag category</option>
                      <option value="label">Tag label</option>
                      <option value="time">Timeline time</option>
                    </select>
                  </div>
                  <div className="check-grid">
                    <section>
                      <h3>Writing Pattern Analysis</h3>
                      {authorCheck.writingPatternChecks.map((check) => (
                        <article className={`check-row ${check.status}`} key={`${check.label}-${check.detail}`}>
                          <span>{check.status}</span>
                          <div><strong>{check.label}</strong><p>{check.detail}</p></div>
                        </article>
                      ))}
                    </section>
                    <section>
                      <h3>Style Consistency</h3>
                      {authorCheck.styleConsistencyChecks.map((check) => (
                        <article className={`check-row ${check.status}`} key={`${check.label}-${check.detail}`}>
                          <span>{check.status}</span>
                          <div><strong>{check.label}</strong><p>{check.detail}</p></div>
                        </article>
                      ))}
                    </section>
                  </div>
                  <section className="source-highlight-list">
                    <h3>Paste Event Review</h3>
                    {pasteEventCards.length ? pasteEventCards.map((card) => (
                      <article key={card.id}>
                        <div><strong>{card.title}</strong><span>{card.wordCount} words</span></div>
                        <p>{card.detail}</p>
                        <blockquote>{card.textPreview || "No pasted text preview available."}</blockquote>
                        {card.replayFrameIndex !== null ? (
                          <button className="text-button" onClick={() => onReplayIndexChange(card.replayFrameIndex as number)} type="button">
                            Open in replay
                          </button>
                        ) : null}
                      </article>
                    )) : <div className="report-empty">No pasted source highlights were found.</div>}
                  </section>
                  <section className="summary-panel">
                    <h3>Comprehension Summary</h3>
                    <div className="text-evidence">{professorState.report?.summaryText || "No comprehension response returned."}</div>
                  </section>
                  {sortedEvidenceTags.length ? (
                    <section className="event-list compact-evidence-list">
                      {sortedEvidenceTags.slice(0, 4).map((tag) => (
                        <article className="event-card" key={tag.id}>
                          <div className="tag-card-header">
                            <p className="eyebrow">{tag.category}</p>
                            {tag.at !== undefined ? <span>{new Date(tag.at).toLocaleTimeString()}</span> : null}
                          </div>
                          <h3>{tag.label}</h3>
                          <p>{tag.detail}</p>
                        </article>
                      ))}
                    </section>
                  ) : null}
                </>
              ) : (
                <div className="report-empty">Open a submitted session to generate an AuthorCheck report.</div>
              )}
            </aside>
          </section>

          <section className="panel replay-panel classroom-card">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Replay</p>
                <h2>Writing Timeline</h2>
              </div>
              <button className="ghost" disabled={!activeReplayFrames.length} onClick={onPlayReplay}>
                {isPlaying ? "Pause" : "Play"}
              </button>
            </div>
            <input
              id="replay-slider"
              type="range"
              min="0"
              max={Math.max(0, activeReplayFrames.length - 1)}
              value={replayIndex}
              onChange={(event) => onReplayIndexChange(Number(event.target.value))}
            />
            {timelineMarkers.length ? (
              <div className="timeline-marker-rail" aria-label="Report timeline markers">
                {timelineMarkers.map((marker) => (
                  <button
                    className={`timeline-marker ${marker.kind}`}
                    disabled={marker.replayFrameIndex === null}
                    key={marker.id}
                    onClick={() => marker.replayFrameIndex !== null ? onReplayIndexChange(marker.replayFrameIndex) : undefined}
                    type="button"
                  >
                    <span>{new Date(marker.at).toLocaleTimeString()}</span>
                    <strong>{marker.label}</strong>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="replay-output">
              {replayFrame ? `[${new Date(replayFrame.at).toLocaleTimeString()}] ${replayFrame.label}\n\n${replayFrame.text}` : ""}
            </div>
          </section>

          {professorState.report ? (
            <section className="panel classroom-card rubric-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Grading</p>
                  <h2>Rubric</h2>
                </div>
              </div>
              <div className="rubric-grid">
                {["Argument", "Evidence", "Organization", "Original Process"].map((item) => (
                  <label key={item}>
                    {item}
                    <input type="number" min="0" max="25" placeholder="0-25" />
                  </label>
                ))}
              </div>
              <textarea placeholder="Private grading notes..." />
            </section>
          ) : null}
        </>
      ) : (
        <>
          <section className="instructor-overview-grid">
            <section className="panel classroom-card analytics-card">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Analytics</p>
                  <h2>Class Engagement</h2>
                </div>
              </div>
              <dl className="metrics compact-metrics">
                <div><dt>Pending</dt><dd>{reviewableSubmissions.length}</dd></div>
                <div><dt>Flagged</dt><dd>{professorState.submissions.filter((submission) => submission.submittedAt).length}</dd></div>
                <div><dt>Roster</dt><dd>{professorState.roster.length}</dd></div>
                <div><dt>Templates</dt><dd>6</dd></div>
              </dl>
            </section>

            <section className="panel classroom-card template-library-card">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Template Library</p>
                  <h2>Quick Creation</h2>
                </div>
              </div>
              <div className="template-list">
                {["Argument Essay", "Research Summary", "Lab Reflection", "Source Analysis", "Reading Response", "Capstone Draft"].map((template) => (
                  <button className="template-chip" key={template} type="button">{template}</button>
                ))}
              </div>
            </section>
          </section>

          <section className="dashboard-grid classroom-management-grid">
            <section className="panel classroom-card">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Classwork</p>
                  <h2>Assignments</h2>
                </div>
              </div>
              <form className="stacked-form" onSubmit={onCreateAssignment}>
                <label htmlFor="assignment-title">Title</label>
                <input
                  id="assignment-title"
                  value={assignmentForm.title}
                  onChange={(event) => onAssignmentFormChange({ ...assignmentForm, title: event.target.value })}
                />
                <label htmlFor="assignment-prompt">Prompt</label>
                <textarea
                  id="assignment-prompt"
                  value={assignmentForm.prompt}
                  onChange={(event) => onAssignmentFormChange({ ...assignmentForm, prompt: event.target.value })}
                />
                <label htmlFor="assignment-due">Due date</label>
                <input
                  id="assignment-due"
                  type="date"
                  value={assignmentForm.dueAt}
                  onChange={(event) => onAssignmentFormChange({ ...assignmentForm, dueAt: event.target.value })}
                />
                <button className="primary" disabled={professorState.assignmentCreateLoading} type="submit">
                  {professorState.assignmentCreateLoading ? "Creating..." : "Create Assignment"}
                </button>
                {professorState.assignmentCreateError ? <p className="sync-error">{professorState.assignmentCreateError}</p> : null}
              </form>
              {professorState.assignmentsLoading ? (
                <div className="report-empty">Loading assignments...</div>
              ) : professorState.assignmentsError ? (
                <div className="report-empty">{professorState.assignmentsError}</div>
              ) : professorState.assignments.length ? (
                <div className="select-list">
                  {professorState.assignments.map((assignment) => (
                    <button
                      className={assignment.id === professorState.selectedAssignmentId ? "list-button active" : "list-button"}
                      key={assignment.id}
                      onClick={() => onSelectAssignment(assignment.id)}
                      type="button"
                    >
                      <span>{assignment.title}</span>
                      <small>{assignment.dueAt ? `Due ${new Date(assignment.dueAt).toLocaleDateString()} - ${assignment.prompt}` : assignment.prompt}</small>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="report-empty">No assignments available.</div>
              )}
            </section>

            <section className="panel classroom-card">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">People</p>
                  <h2>Students</h2>
                </div>
              </div>
              <form className="stacked-form compact-form" onSubmit={onEnrollStudent}>
                <label htmlFor="student-name">Student name</label>
                <input
                  id="student-name"
                  value={enrollmentForm.displayName}
                  onChange={(event) => onEnrollmentFormChange({ ...enrollmentForm, displayName: event.target.value })}
                />
                <label htmlFor="student-email">Student email</label>
                <input
                  id="student-email"
                  type="email"
                  value={enrollmentForm.email}
                  onChange={(event) => onEnrollmentFormChange({ ...enrollmentForm, email: event.target.value })}
                />
                <label htmlFor="welcome-message">Welcome message</label>
                <textarea
                  id="welcome-message"
                  placeholder="Add a class welcome note for email invites..."
                />
                <button className="primary" disabled={!professorState.selectedAssignmentId || professorState.enrollmentLoading} type="submit">
                  {professorState.enrollmentLoading ? "Saving..." : "Enroll Student / Send Invite"}
                </button>
                {professorState.enrollmentError ? <p className="sync-error">{professorState.enrollmentError}</p> : null}
              </form>
              {professorState.rosterLoading ? (
                <div className="report-empty">Loading roster...</div>
              ) : professorState.rosterError ? (
                <div className="report-empty">{professorState.rosterError}</div>
              ) : professorState.roster.length ? (
                <div className="roster-list">
                  {professorState.roster.map((student) => (
                    <div className="roster-row" key={student.studentId}>
                      <div>
                        <strong>{student.studentName}</strong>
                        <span>{student.studentEmail}</span>
                      </div>
                      <button
                        className="text-button"
                        disabled={professorState.enrollmentLoading}
                        onClick={() => onRemoveStudent(student.studentId)}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="report-empty">No students enrolled.</div>
              )}
            </section>

            <section className="panel review-summary classroom-card">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Review Queue</p>
                  <h2>Submission Status</h2>
                </div>
              </div>
              <dl className="metrics compact-metrics">
                <div><dt>Total</dt><dd>{professorState.submissions.length}</dd></div>
                <div><dt>Started</dt><dd>{readyCount}</dd></div>
                <div><dt>Submitted</dt><dd>{submittedCount}</dd></div>
                <div><dt>Ready</dt><dd>{reviewableSubmissions.length}</dd></div>
              </dl>
              <p className="note">Submitted work opens in a separate evidence review page.</p>
            </section>
          </section>

          <section className="dashboard-grid classroom-stream-grid">
            <section className="panel classroom-card">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Student Work</p>
                  <h2>Submissions</h2>
                </div>
              </div>
              {professorState.submissionsLoading ? (
                <div className="report-empty">Loading submissions...</div>
              ) : professorState.submissionsError ? (
                <div className="report-empty">{professorState.submissionsError}</div>
              ) : professorState.submissions.length ? (
                <div className="select-list">
                  {professorState.submissions.map((submission) => {
                    const reviewHref = submission.sessionId
                      ? `/professor/submissions/${encodeURIComponent(submission.sessionId)}?assignmentId=${encodeURIComponent(professorState.selectedAssignmentId)}`
                      : "";

                    return submission.sessionId && submission.submittedAt ? (
                      <Link className="list-button list-link" href={reviewHref} key={`${submission.studentId}-${submission.sessionId}`}>
                        <span>{submission.studentName}</span>
                        <small>{submission.status.replace("_", " ")} - {new Date(submission.submittedAt).toLocaleDateString()}</small>
                      </Link>
                    ) : (
                      <div className="list-button muted" key={`${submission.studentId}-${submission.sessionId || "not-started"}`}>
                        <span>{submission.studentName}</span>
                        <small>{submission.status.replace("_", " ")} {submission.submittedAt ? `- ${new Date(submission.submittedAt).toLocaleDateString()}` : submission.studentEmail}</small>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="report-empty">No submissions for this assignment.</div>
              )}
            </section>
          </section>
        </>
      )}
    </section>
  );
}

function StatusPanel({ title, message, children }: { title: string; message: string; children?: ReactNode }) {
  return (
    <section className="status-panel" role="status" aria-live="polite">
      <p className="eyebrow">Workspace</p>
      <h2>{title}</h2>
      <p>{message}</p>
      {children}
    </section>
  );
}

function studentSessionToState(data: StudentSessionResponse): StudentState {
  return {
    assignment: data.assignment,
    sessionId: data.session.id,
    paperText: data.paperText,
    events: data.events,
    snapshots: data.snapshots.length ? data.snapshots : [{ at: Date.now(), text: data.paperText }],
    submittedText: data.submittedText,
    summaryText: data.summaryText,
    submittedAt: data.session.submittedAt,
    lockedAt: data.session.lockedAt,
    summaryCompletedAt: data.summaryCompletedAt,
    status: data.session.status
  };
}

function formatSelectedText(value: string, selectionStart: number, selectionEnd: number, kind: TextFormatKind) {
  const selected = value.slice(selectionStart, selectionEnd);
  const fallback = kind === "underline" ? "underlined text" : `${kind} text`;
  const insertion = selected || fallback;

  const wrappers: Record<TextFormatKind, [string, string]> = {
    bold: ["**", "**"],
    italic: ["*", "*"],
    underline: ["<u>", "</u>"]
  };

  const [prefix, suffix] = wrappers[kind];
  const nextText = `${value.slice(0, selectionStart)}${prefix}${insertion}${suffix}${value.slice(selectionEnd)}`;
  const insertedStart = selectionStart + prefix.length;
  const insertedEnd = insertedStart + insertion.length;

  return {
    text: nextText,
    selectionStart: insertedStart,
    selectionEnd: insertedEnd
  };
}

function readApiError(data: unknown, fallback: string) {
  return data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
    ? (data as { error: string }).error
    : fallback;
}

function formatRole(role: UserRole) {
  return role === "student" ? "Student" : "Professor";
}

function formatAssignmentMeta(assignment: StudentAssignment) {
  const status = assignment.status.replaceAll("_", " ");
  const due = assignment.dueAt ? `Due ${new Date(assignment.dueAt).toLocaleDateString()}` : "No due date";
  const attempt = assignment.attemptNumber ? `Attempt ${assignment.attemptNumber}` : "Not started";
  return `${due} - ${status} - ${attempt}`;
}

function findDueDateConflicts(assignments: StudentAssignment[]) {
  const dueCounts = new Map<string, number>();
  assignments.forEach((assignment) => {
    if (!assignment.dueAt || assignment.submittedAt) return;
    const key = new Date(assignment.dueAt).toISOString().slice(0, 10);
    dueCounts.set(key, (dueCounts.get(key) || 0) + 1);
  });
  return [...dueCounts.values()].some((count) => count > 1);
}

function formatTimer(seconds: number) {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const remaining = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${remaining}`;
}
