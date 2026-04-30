"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  createDefaultWorkspace,
  loadWorkspace,
  saveWorkspace,
  type Assignment,
  type AuthUser
} from "@/lib/persistence";
import type { ReplayFrame } from "@/lib/replay";
import { comparisonToObservations, type SummaryComparison } from "@/lib/summary-comparison";
import type {
  AppendWritingEventRequest,
  LockSubmissionRequest,
  ProfessorReportResponse,
  TimedSummaryRequest
} from "@/lib/server-boundaries";
import { DEMO_SESSION_ID } from "@/lib/demo-ids";

export default function Home() {
  const defaultWorkspace = useMemo(() => createDefaultWorkspace(), []);
  const [users, setUsers] = useState<AuthUser[]>(defaultWorkspace.users);
  const [currentUserId, setCurrentUserId] = useState(defaultWorkspace.currentUserId);
  const [assignment, setAssignment] = useState<Assignment>(defaultWorkspace.assignment);
  const [paperText, setPaperText] = useState(defaultWorkspace.submission.paperText);
  const [events, setEvents] = useState<WritingEvent[]>(defaultWorkspace.submission.events);
  const [snapshots, setSnapshots] = useState<Snapshot[]>(defaultWorkspace.submission.snapshots);
  const [submittedText, setSubmittedText] = useState(defaultWorkspace.submission.submittedText);
  const [summaryText, setSummaryText] = useState(defaultWorkspace.submission.summaryText);
  const [submittedAt, setSubmittedAt] = useState<number | null>(defaultWorkspace.submission.submittedAt);
  const [summaryCompletedAt, setSummaryCompletedAt] = useState<number | null>(defaultWorkspace.submission.summaryCompletedAt);
  const [persistenceReady, setPersistenceReady] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [remainingSeconds, setRemainingSeconds] = useState(120);
  const [replayFrames, setReplayFrames] = useState<ReplayFrame[]>([]);
  const [comparison, setComparison] = useState<SummaryComparison | null>(null);
  const [professorReport, setProfessorReport] = useState<ProfessorReportResponse | null>(null);
  const [serverSyncError, setServerSyncError] = useState("");
  const [reportLoadError, setReportLoadError] = useState("");
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

  const currentUser = users.find((user) => user.id === currentUserId) || users[0];
  const activeRole = currentUser.role;

  useEffect(() => {
    const workspace = loadWorkspace(window.localStorage);
    setUsers(workspace.users);
    setCurrentUserId(workspace.currentUserId);
    setAssignment(workspace.assignment);
    setPaperText(workspace.submission.paperText);
    setEvents(workspace.submission.events);
    setSnapshots(workspace.submission.snapshots);
    setSubmittedText(workspace.submission.submittedText);
    setSummaryText(workspace.submission.summaryText);
    setSubmittedAt(workspace.submission.submittedAt);
    setSummaryCompletedAt(workspace.submission.summaryCompletedAt);
    lastTextRef.current = workspace.submission.paperText;
    setPersistenceReady(true);
  }, []);

  useEffect(() => {
    if (!persistenceReady) return;

    saveWorkspace(window.localStorage, {
      users,
      currentUserId,
      assignment,
      submission: {
        ...defaultWorkspace.submission,
        assignmentId: assignment.id,
        paperText,
        events,
        snapshots,
        submittedText,
        summaryText,
        submittedAt,
        summaryCompletedAt,
        updatedAt: Date.now()
      }
    });
  }, [
    assignment,
    currentUserId,
    defaultWorkspace.submission,
    events,
    paperText,
    persistenceReady,
    snapshots,
    submittedAt,
    submittedText,
    summaryCompletedAt,
    summaryText,
    users
  ]);

  useEffect(() => {
    if (!persistenceReady) return;

    const controller = new AbortController();
    fetch("/api/replay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshots, events }),
      signal: controller.signal
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Replay reconstruction failed")))
      .then((data: { frames: ReplayFrame[] }) => {
        setReplayFrames(data.frames);
        setReplayIndex((current) => Math.min(current, Math.max(0, data.frames.length - 1)));
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setReplayFrames([]);
      });

    return () => controller.abort();
  }, [events, persistenceReady, snapshots]);

  useEffect(() => {
    if (!persistenceReady || !submittedText || !summaryText) {
      setComparison(null);
      return;
    }

    const controller = new AbortController();
    fetch("/api/summary-comparison", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submittedText, summaryText }),
      signal: controller.signal
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Summary comparison failed")))
      .then((data: SummaryComparison) => setComparison(data))
      .catch((error: Error) => {
        if (error.name !== "AbortError") setComparison(null);
      });

    return () => controller.abort();
  }, [persistenceReady, submittedText, summaryText]);

  useEffect(() => {
    if (!persistenceReady || activeRole !== "professor") {
      setProfessorReport(null);
      setReportLoadError("");
      return;
    }

    const controller = new AbortController();
    setProfessorReport(null);
    setReportLoadError("");
    fetch(`/api/reports/${DEMO_SESSION_ID}?professorId=${encodeURIComponent(currentUser.id)}`, {
      signal: controller.signal
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Report loading failed")))
      .then((data: ProfessorReportResponse) => {
        setProfessorReport(data);
        setReplayIndex((current) => Math.min(current, Math.max(0, data.frames.length - 1)));
        setReportLoadError("");
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") {
          setProfessorReport(null);
          setReportLoadError(error.message);
        }
      });

    return () => controller.abort();
  }, [activeRole, currentUser.id, persistenceReady]);

  useEffect(() => {
    return () => {
      if (summaryTimerRef.current) window.clearInterval(summaryTimerRef.current);
      if (replayTimerRef.current) window.clearInterval(replayTimerRef.current);
    };
  }, []);

  const submitted = submittedAt !== null;
  const studentObservations = useMemo(() => {
    if (!submittedText) return [];
    const items: Observation[] = analyzeProcess(events, submittedText);
    if (comparison) items.push(...comparisonToObservations(comparison));
    return items;
  }, [comparison, events, submittedText]);

  const pasteCount = events.filter((event) => event.type === "paste").length;
  const deletionCount = events.filter((event) => event.deletionEvent).length;
  const observations = activeRole === "professor" ? professorReport?.observations ?? [] : studentObservations;
  const activeReplayFrames = activeRole === "professor" ? professorReport?.frames ?? [] : replayFrames;
  const replayFrame = activeReplayFrames[replayIndex];

  function recordEvent(event: Omit<WritingEvent, "id">) {
    const localEvent = {
      id: crypto.randomUUID(),
      ...event
    };

    setEvents((current) => [
      ...current,
      localEvent
    ]);

    return localEvent;
  }

  function handlePaperChange(nextText: string) {
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
    setPaperText(nextText);
    setSnapshots((current) => [...current, { at: now, text: nextText }]);
  }

  async function submitPaper() {
    const now = Date.now();
    const submitEvent = recordEvent({
      type: "submit",
      at: now,
      words: countWords(paperText)
    });
    const snapshot = { at: now, text: paperText };
    await persistWritingEvent(submitEvent);
    const locked = await lockSubmittedPaper(paperText, snapshot);
    if (!locked) return;

    setSubmittedText(paperText);
    setSubmittedAt(now);
    setSnapshots((current) => [...current, snapshot]);
    summaryDraftRef.current = "";
    summaryStartedAtRef.current = now;
    setSummaryDraft("");
    setRemainingSeconds(120);
    setSummaryOpen(true);
    startSummaryTimer();
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
    if (summaryTimerRef.current) window.clearInterval(summaryTimerRef.current);
    summaryTimerRef.current = null;
    const completedAt = Date.now();
    void storeSummary(summaryDraftRef.current, summaryStartedAtRef.current || completedAt, completedAt);
    setSummaryText(summaryDraftRef.current);
    setSummaryCompletedAt(completedAt);
    setSummaryOpen(false);
  }

  function switchUser(nextUserId: string) {
    const nextUser = users.find((user) => user.id === nextUserId);
    if (!nextUser) return;

    setCurrentUserId(nextUser.id);
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
    const { id: _id, ...eventPayload } = event;
    const request: AppendWritingEventRequest = {
      sessionId: DEMO_SESSION_ID,
      studentId: currentUser.id,
      event: eventPayload
    };

    return enqueueMutation("/api/writing-events", request);
  }

  function lockSubmittedPaper(submittedTextForLock: string, snapshot: Snapshot) {
    const request: LockSubmissionRequest = {
      sessionId: DEMO_SESSION_ID,
      studentId: currentUser.id,
      submittedText: submittedTextForLock,
      snapshot
    };

    return enqueueMutation("/api/submissions/lock", request);
  }

  function storeSummary(summaryTextForStorage: string, startedAt: number, completedAt: number) {
    const request: TimedSummaryRequest = {
      sessionId: DEMO_SESSION_ID,
      studentId: currentUser.id,
      startedAt,
      completedAt,
      summaryText: summaryTextForStorage
    };

    return enqueueMutation("/api/timed-summaries", request);
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
        throw new Error(typeof data.error === "string" ? data.error : "Server mutation failed.");
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
        <div className="account-bar">
          <label htmlFor="user-switcher">Signed in as</label>
          <select id="user-switcher" value={currentUser.id} onChange={(event) => switchUser(event.target.value)}>
            {users.map((user) => (
              <option key={user.id} value={user.id}>{user.name}</option>
            ))}
          </select>
        </div>
      </header>

      <main>
        {activeRole === "student" ? (
          <section className="view active">
            <section className="assignment">
              <div>
                <p className="eyebrow">Assignment</p>
                <h2>{assignment.prompt}</h2>
              </div>
              <button className="primary" disabled={submitted} onClick={submitPaper}>
                Submit Paper
              </button>
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
                  <div><dt>Words</dt><dd>{countWords(paperText)}</dd></div>
                  <div><dt>Active Time</dt><dd>{formatDuration(activeWritingMs(events))}</dd></div>
                  <div><dt>Paste Events</dt><dd>{pasteCount}</dd></div>
                  <div><dt>Deletion Events</dt><dd>{deletionCount}</dd></div>
                </dl>
                {serverSyncError ? <p className="sync-error">{serverSyncError}</p> : null}
                <p className="note">The editor records factual writing events for review after submission.</p>
              </aside>

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
                  value={paperText}
                  onBeforeInput={(event) => {
                    pendingInputTypeRef.current = event.nativeEvent.inputType || "unknown";
                  }}
                  onPaste={(event) => {
                    pendingPasteRef.current = {
                      words: countWords(event.clipboardData.getData("text"))
                    };
                  }}
                  onChange={(event) => handlePaperChange(event.target.value)}
                />
              </section>
            </section>
          </section>
        ) : (
          <section className="view active">
            <section className="report-grid">
              <section className="panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Professor Review</p>
                    <h2>Neutral Evidence Report</h2>
                  </div>
                </div>
                {reportLoadError ? (
                  <div className="report-empty">{reportLoadError}</div>
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
                  <div className="report-empty">Submit a paper and timed summary to generate a report.</div>
                )}
              </section>

              <section className="panel replay-panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Rewind</p>
                    <h2>Timeline Replay</h2>
                  </div>
                  <button className="ghost" onClick={playReplay}>{isPlaying ? "Pause" : "Play"}</button>
                </div>
                <input
                  id="replay-slider"
                  type="range"
                  min="0"
                  max={Math.max(0, activeReplayFrames.length - 1)}
                  value={replayIndex}
                  onChange={(event) => setReplayIndex(Number(event.target.value))}
                />
                <div className="replay-output">
                  {replayFrame ? `[${new Date(replayFrame.at).toLocaleTimeString()}] ${replayFrame.label}\n\n${replayFrame.text}` : ""}
                </div>
              </section>
            </section>
          </section>
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

function formatTimer(seconds: number) {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const remaining = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${remaining}`;
}
