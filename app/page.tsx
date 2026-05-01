"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MutableRefObject, type ReactNode } from "react";
import {
  activeWritingMs,
  analyzeProcess,
  countWords,
  formatDuration,
  getDiff,
  type Observation,
  type Snapshot,
  type WritingEvent
} from "@/lib/writing-events";
import type { Assignment, AuthUser, UserRole } from "@/lib/persistence";
import type { ReplayFrame } from "@/lib/replay";
import { comparisonToObservations, type SummaryComparison } from "@/lib/summary-comparison";
import type {
  AppendWritingEventBody,
  AssignmentSubmissionListResponse,
  LockSubmissionBody,
  ProfessorAssignmentListResponse,
  ProfessorReportResponse,
  ReplayRequestBody,
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

type ProfessorState = {
  assignments: ProfessorAssignment[];
  assignmentsLoading: boolean;
  assignmentsError: string;
  selectedAssignmentId: string;
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
  selectedAssignmentId: "",
  submissions: [],
  submissionsLoading: false,
  submissionsError: "",
  selectedSessionId: "",
  report: null,
  reportLoading: false,
  reportError: ""
};

export default function Home() {
  const [accessState, setAccessState] = useState<AccessState>("loading");
  const [accessMessage, setAccessMessage] = useState("");
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [signInLoading, setSignInLoading] = useState<UserRole | null>(null);
  const [signInError, setSignInError] = useState("");
  const [signInForm, setSignInForm] = useState({ username: "student", password: "student-demo" });
  const [signOutLoading, setSignOutLoading] = useState(false);
  const [studentState, setStudentState] = useState<StudentState | null>(null);
  const [studentLoading, setStudentLoading] = useState(false);
  const [studentError, setStudentError] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");
  const [professorState, setProfessorState] = useState<ProfessorState>(initialProfessorState);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [remainingSeconds, setRemainingSeconds] = useState(120);
  const [replayFrames, setReplayFrames] = useState<ReplayFrame[]>([]);
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

  const hydrateStudent = useCallback(async () => {
    setStudentLoading(true);
    setStudentError("");

    try {
      const data = await apiGet<StudentSessionResponse>("/api/assignments/current");
      const nextState = studentSessionToState(data);
      setStudentState(nextState);
      lastTextRef.current = nextState.paperText;
      setReplayIndex(0);
      setServerSyncError("");
      setAccessState("authenticated");
    } catch (error) {
      setStudentState(null);
      setStudentError(error instanceof Error ? error.message : "Student session failed to load.");
    } finally {
      setStudentLoading(false);
    }
  }, [apiGet]);

  const loadProfessorAssignments = useCallback(async () => {
    setProfessorState((current) => ({
      ...current,
      assignmentsLoading: true,
      assignmentsError: "",
      submissions: [],
      selectedAssignmentId: "",
      selectedSessionId: "",
      report: null
    }));

    try {
      const data = await apiGet<ProfessorAssignmentListResponse>("/api/professor/assignments");
      setProfessorState((current) => ({
        ...current,
        assignments: data.assignments,
        assignmentsLoading: false,
        selectedAssignmentId: data.assignments[0]?.id ?? "",
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
  }, [apiGet]);

  const hydrateUserWorkspace = useCallback(async (user: AuthUser) => {
    setCurrentUser(user);
    setAccessState("authenticated");
    setAccessMessage("");
    setSignInError("");
    if (user.role === "student") {
      await hydrateStudent();
    } else {
      await loadProfessorAssignments();
    }
  }, [hydrateStudent, loadProfessorAssignments]);

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

  async function signInAsDemo(event?: FormEvent<HTMLFormElement>) {
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

  function fillDemoSignIn(role: UserRole) {
    setSignInForm(role === "student"
      ? { username: "student", password: "student-demo" }
      : { username: "professor", password: "professor-demo" });
    setSignInError("");
  }

  async function signOut() {
    setSignOutLoading(true);

    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setCurrentUser(null);
      setStudentState(null);
      setProfessorState(initialProfessorState);
      setAccessState("unauthenticated");
      setAccessMessage("Sign in is required to continue.");
      setSignOutLoading(false);
    }
  }

  useEffect(() => {
    if (!professorState.selectedAssignmentId) {
      setProfessorState((current) => ({
        ...current,
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
      selectedSessionId: "",
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
          selectedSessionId: data.submissions[0]?.sessionId ?? ""
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
      return;
    }

    const controller = new AbortController();
    void loadStoredReplay(studentState.sessionId, controller.signal);

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
    if (!studentState || submitted) return;

    const now = Date.now();
    const submitEvent = recordEvent({
      type: "submit",
      at: now,
      words: countWords(studentState.paperText)
    });
    const snapshot = { at: now, text: studentState.paperText };
    await persistWritingEvent(submitEvent);
    const locked = await lockSubmittedPaper(studentState.paperText, snapshot);
    if (!locked) return;

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
  }

  async function resetStudentAttempt() {
    if (!studentState || resetLoading) return;

    setResetLoading(true);
    setResetError("");
    if (summaryTimerRef.current) window.clearInterval(summaryTimerRef.current);
    summaryTimerRef.current = null;
    setSummaryOpen(false);

    try {
      await mutationQueueRef.current;
      const response = await fetch("/api/sessions/reset", {
        method: "POST"
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "New attempt failed." }));
        handleAccessError(response.status, readApiError(data, "New attempt failed."));
        throw new Error(readApiError(data, "New attempt failed."));
      }

      summaryDraftRef.current = "";
      summaryStartedAtRef.current = null;
      lastInputAtRef.current = null;
      pendingInputTypeRef.current = "unknown";
      pendingPasteRef.current = null;
      setSummaryDraft("");
      setRemainingSeconds(120);
      setComparison(null);
      setReplayFrames([]);
      await hydrateStudent();
    } catch (error) {
      setResetError(error instanceof Error ? error.message : "New attempt failed.");
    } finally {
      setResetLoading(false);
    }
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
      if (ok) void loadStoredReplay(sessionId);
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
      if (ok) void loadStoredReplay(sessionId);
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
          <p className="eyebrow">Verified Writing MVP</p>
          <h1>Process capture, rewind, and comprehension check</h1>
        </div>
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
            <p className="account-role">No active session</p>
          )}
        </div>
      </header>

      <main>
        {accessState === "loading" ? (
          <StatusPanel title="Loading session" message="Checking your signed-in session." />
        ) : accessState === "unauthenticated" ? (
          <StatusPanel title="Sign in" message="Use your workspace credentials. Demo accounts are available for local review.">
            <form className="demo-login" onSubmit={signInAsDemo}>
              <label htmlFor="demo-username">Username</label>
              <input
                id="demo-username"
                autoComplete="username"
                value={signInForm.username}
                onChange={(event) => setSignInForm((current) => ({ ...current, username: event.target.value }))}
              />
              <label htmlFor="demo-password">Password</label>
              <input
                id="demo-password"
                autoComplete="current-password"
                type="password"
                value={signInForm.password}
                onChange={(event) => setSignInForm((current) => ({ ...current, password: event.target.value }))}
              />
              <div className="status-actions" aria-label="Demo sign in">
                <button className="primary" disabled={signInLoading !== null} type="submit">
                  {signInLoading ? "Signing in..." : "Sign in"}
                </button>
                <button className="ghost" disabled={signInLoading !== null} onClick={() => fillDemoSignIn("student")} type="button">
                  Student demo
                </button>
                <button className="ghost" disabled={signInLoading !== null} onClick={() => fillDemoSignIn("professor")} type="button">
                  Professor demo
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
            loading={studentLoading}
            error={studentError}
            submitted={submitted}
            pasteCount={pasteCount}
            deletionCount={deletionCount}
            serverSyncError={serverSyncError}
            resetLoading={resetLoading}
            resetError={resetError}
            replayFrame={replayFrame}
            replayIndex={replayIndex}
            activeReplayFrames={activeReplayFrames}
            isPlaying={isPlaying}
            onSubmit={submitPaper}
            onResetAttempt={resetStudentAttempt}
            onChange={handlePaperChange}
            onReplayIndexChange={setReplayIndex}
            onPlayReplay={playReplay}
            pendingInputTypeRef={pendingInputTypeRef}
            pendingPasteRef={pendingPasteRef}
          />
        ) : (
          <ProfessorView
            professorState={professorState}
            observations={observations}
            replayFrame={replayFrame}
            replayIndex={replayIndex}
            activeReplayFrames={activeReplayFrames}
            isPlaying={isPlaying}
            onSelectAssignment={selectAssignment}
            onSelectSession={selectSession}
            onReplayIndexChange={setReplayIndex}
            onPlayReplay={playReplay}
          />
        )}
      </main>

      {summaryOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section className="dialog-card modal" role="dialog" aria-modal="true" aria-labelledby="summary-title">
            <div>
              <p className="eyebrow">Timed Summary</p>
              <h2 id="summary-title">Summarize your submitted paper</h2>
              <p className="note">
                You have <span>{formatTimer(remainingSeconds)}</span>. Use bullet points or short paragraphs. The paper is locked during this step.
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
            <button className="primary" onClick={completeSummary}>Complete Summary</button>
          </section>
        </div>
      ) : null}
    </>
  );
}

function StudentView({
  studentState,
  loading,
  error,
  submitted,
  pasteCount,
  deletionCount,
  serverSyncError,
  resetLoading,
  resetError,
  replayFrame,
  replayIndex,
  activeReplayFrames,
  isPlaying,
  onSubmit,
  onResetAttempt,
  onChange,
  onReplayIndexChange,
  onPlayReplay,
  pendingInputTypeRef,
  pendingPasteRef
}: {
  studentState: StudentState | null;
  loading: boolean;
  error: string;
  submitted: boolean;
  pasteCount: number;
  deletionCount: number;
  serverSyncError: string;
  resetLoading: boolean;
  resetError: string;
  replayFrame: ReplayFrame | undefined;
  replayIndex: number;
  activeReplayFrames: ReplayFrame[];
  isPlaying: boolean;
  onSubmit: () => void;
  onResetAttempt: () => void;
  onChange: (nextText: string) => void;
  onReplayIndexChange: (index: number) => void;
  onPlayReplay: () => void;
  pendingInputTypeRef: MutableRefObject<string>;
  pendingPasteRef: MutableRefObject<{ words: number } | null>;
}) {
  if (loading) return <StatusPanel title="Loading assignment" message="Hydrating your draft from the database." />;
  if (error) return <StatusPanel title="Assignment unavailable" message={error} />;
  if (!studentState) return <StatusPanel title="No assignment" message="No active writing session was returned." />;

  return (
    <section className="view active">
      <section className="flow-strip" aria-label="Writing flow">
        <span className="flow-step active">Write</span>
        <span className={activeReplayFrames.length ? "flow-step active" : "flow-step"}>Replay</span>
        <span className={submitted ? "flow-step active" : "flow-step"}>Submit</span>
        <span className={studentState.summaryCompletedAt ? "flow-step active" : "flow-step"}>Summary</span>
      </section>

      <section className="assignment">
        <div>
          <p className="eyebrow">Assignment</p>
          <h2>{studentState.assignment.prompt}</h2>
        </div>
        <div className="assignment-actions">
          <button className="ghost" disabled={resetLoading} onClick={onResetAttempt}>
            {resetLoading ? "Starting..." : "New attempt"}
          </button>
          <button className="primary" disabled={submitted || resetLoading} onClick={onSubmit}>
            Submit Paper
          </button>
        </div>
      </section>

      <section className="workspace">
        <aside className="panel">
          <div className="panel-header compact">
            <div>
              <p className="eyebrow">Session</p>
              <h3>Live Capture</h3>
            </div>
            <span className="status-pill">{submitted ? "Locked" : "Recording"}</span>
          </div>
          <dl className="metrics">
            <div><dt>Words</dt><dd>{countWords(studentState.paperText)}</dd></div>
            <div><dt>Active Time</dt><dd>{formatDuration(activeWritingMs(studentState.events))}</dd></div>
            <div><dt>Paste Events</dt><dd>{pasteCount}</dd></div>
            <div><dt>Deletion Events</dt><dd>{deletionCount}</dd></div>
          </dl>
          {serverSyncError ? <p className="sync-error">{serverSyncError}</p> : null}
          {resetError ? <p className="sync-error">{resetError}</p> : null}
          {studentState.summaryCompletedAt ? <p className="note">Timed summary complete. The paper remains locked.</p> : null}
          <p className="note">The editor records factual writing events for review after submission.</p>
        </aside>

        <div className="student-main">
          <section className="editor-shell">
            <div className="editor-heading">
              <label htmlFor="paper-editor">Paper</label>
              <span>{submitted ? "Submitted" : "Draft"}</span>
            </div>
            <textarea
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

          <section className="panel replay-panel compact-replay">
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
  observations,
  replayFrame,
  replayIndex,
  activeReplayFrames,
  isPlaying,
  onSelectAssignment,
  onSelectSession,
  onReplayIndexChange,
  onPlayReplay
}: {
  professorState: ProfessorState;
  observations: Observation[];
  replayFrame: ReplayFrame | undefined;
  replayIndex: number;
  activeReplayFrames: ReplayFrame[];
  isPlaying: boolean;
  onSelectAssignment: (assignmentId: string) => void;
  onSelectSession: (sessionId: string) => void;
  onReplayIndexChange: (index: number) => void;
  onPlayReplay: () => void;
}) {
  return (
    <section className="view active">
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Assignments</p>
              <h2>Choose Review Set</h2>
            </div>
          </div>
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
                >
                  <span>{assignment.title}</span>
                  <small>{assignment.prompt}</small>
                </button>
              ))}
            </div>
          ) : (
            <div className="report-empty">No assignments available.</div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Submissions</p>
              <h2>Choose Session</h2>
            </div>
          </div>
          {professorState.submissionsLoading ? (
            <div className="report-empty">Loading submissions...</div>
          ) : professorState.submissionsError ? (
            <div className="report-empty">{professorState.submissionsError}</div>
          ) : professorState.submissions.length ? (
            <div className="select-list">
              {professorState.submissions.map((submission) => (
                <button
                  className={submission.sessionId === professorState.selectedSessionId ? "list-button active" : "list-button"}
                  key={submission.sessionId}
                  onClick={() => onSelectSession(submission.sessionId)}
                >
                  <span>{submission.studentName}</span>
                  <small>{submission.status} {submission.submittedAt ? `- ${new Date(submission.submittedAt).toLocaleDateString()}` : ""}</small>
                </button>
              ))}
            </div>
          ) : (
            <div className="report-empty">No submissions for this assignment.</div>
          )}
        </section>
      </section>

      <section className="report-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Professor Review</p>
              <h2>Neutral Evidence Report</h2>
            </div>
            {professorState.selectedSessionId ? (
              <div className="export-actions" aria-label="Export report">
                <a className="ghost" href={`/api/reports/${encodeURIComponent(professorState.selectedSessionId)}/export?format=html`}>
                  HTML
                </a>
                <a className="ghost" href={`/api/reports/${encodeURIComponent(professorState.selectedSessionId)}/export?format=csv`}>
                  CSV
                </a>
                <a className="ghost" href={`/api/reports/${encodeURIComponent(professorState.selectedSessionId)}/export?format=pdf`}>
                  PDF
                </a>
              </div>
            ) : null}
          </div>
          {professorState.reportLoading ? (
            <div className="report-empty">Loading report...</div>
          ) : professorState.reportError ? (
            <div className="report-empty">{professorState.reportError}</div>
          ) : observations.length ? (
            <div className="event-list">
              {observations.map((item, index) => (
                <article className="event-card" key={`${item.title}-${index}`}>
                  <p className="eyebrow">{item.group}</p>
                  <h3>{item.title}</h3>
                  <p>{item.detail}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="report-empty">Open a submitted session to generate a report.</div>
          )}
        </section>

        <section className="panel replay-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Rewind</p>
              <h2>Timeline Replay</h2>
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
          <div className="replay-output">
            {replayFrame ? `[${new Date(replayFrame.at).toLocaleTimeString()}] ${replayFrame.label}\n\n${replayFrame.text}` : ""}
          </div>
        </section>
      </section>

      {professorState.report ? (
        <section className="evidence-grid">
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Submitted Paper</p>
                <h2>Locked Text</h2>
              </div>
            </div>
            <div className="text-evidence">{professorState.report.submittedText || "No submitted text returned."}</div>
          </section>
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Timed Summary</p>
                <h2>Comprehension Check</h2>
              </div>
            </div>
            <div className="text-evidence">{professorState.report.summaryText || "No timed summary returned."}</div>
          </section>
        </section>
      ) : null}
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

function readApiError(data: unknown, fallback: string) {
  return data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
    ? (data as { error: string }).error
    : fallback;
}

function formatRole(role: UserRole) {
  return role === "student" ? "Student" : "Professor";
}

function formatTimer(seconds: number) {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const remaining = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${remaining}`;
}
