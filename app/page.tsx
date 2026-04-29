"use client";

import { useMemo, useRef, useState } from "react";
import {
  activeWritingMs,
  analyzeComprehension,
  analyzeProcess,
  countWords,
  formatDuration,
  getDiff,
  type Observation,
  type Snapshot,
  type WritingEvent
} from "@/lib/writing-events";

type ActiveTab = "student" | "professor";

export default function Home() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("student");
  const [paperText, setPaperText] = useState("");
  const [events, setEvents] = useState<WritingEvent[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([{ at: Date.now(), text: "" }]);
  const [submittedText, setSubmittedText] = useState("");
  const [summaryText, setSummaryText] = useState("");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [remainingSeconds, setRemainingSeconds] = useState(120);
  const [replayIndex, setReplayIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const lastTextRef = useRef("");
  const lastInputAtRef = useRef<number | null>(null);
  const pendingInputTypeRef = useRef("unknown");
  const pendingPasteRef = useRef<{ words: number } | null>(null);
  const summaryTimerRef = useRef<number | null>(null);
  const replayTimerRef = useRef<number | null>(null);

  const submitted = submittedText.length > 0;
  const observations = useMemo(() => {
    if (!submittedText) return [];
    const items: Observation[] = analyzeProcess(events, submittedText);
    if (summaryText) items.push(analyzeComprehension(submittedText, summaryText));
    return items;
  }, [events, submittedText, summaryText]);

  const pasteCount = events.filter((event) => event.type === "paste").length;
  const deletionCount = events.filter((event) => event.deletionEvent).length;
  const replaySnapshot = snapshots[replayIndex] || snapshots[0];
  const replayEvent = events[replayIndex - 1];

  function recordEvent(event: Omit<WritingEvent, "id">) {
    setEvents((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        ...event
      }
    ]);
  }

  function handlePaperChange(nextText: string) {
    const now = Date.now();
    const previousText = lastTextRef.current;
    const diff = getDiff(previousText, nextText);
    const pasted = pendingPasteRef.current;
    const eventType = pasted ? "paste" : diff.added ? "insert" : "delete";

    recordEvent({
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

    pendingPasteRef.current = null;
    pendingInputTypeRef.current = "unknown";
    lastInputAtRef.current = now;
    lastTextRef.current = nextText;
    setPaperText(nextText);
    setSnapshots((current) => [...current, { at: now, text: nextText }]);
  }

  function submitPaper() {
    const now = Date.now();
    setSubmittedText(paperText);
    recordEvent({
      type: "submit",
      at: now,
      words: countWords(paperText)
    });
    setSnapshots((current) => [...current, { at: now, text: paperText }]);
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
    setSummaryText(summaryDraft);
    setSummaryOpen(false);
    setActiveTab("professor");
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
        if (next > snapshots.length - 1) {
          if (replayTimerRef.current) window.clearInterval(replayTimerRef.current);
          replayTimerRef.current = null;
          setIsPlaying(false);
          return current;
        }
        return next;
      });
    }, 240);
  }

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Verified Writing MVP</p>
          <h1>Process capture, rewind, and comprehension check</h1>
        </div>
        <nav className="tabs" aria-label="Workspace tabs">
          <button className={`tab ${activeTab === "student" ? "active" : ""}`} onClick={() => setActiveTab("student")}>
            Student
          </button>
          <button className={`tab ${activeTab === "professor" ? "active" : ""}`} onClick={() => setActiveTab("professor")}>
            Professor
          </button>
        </nav>
      </header>

      <main>
        {activeTab === "student" ? (
          <section className="view active">
            <section className="assignment">
              <div>
                <p className="eyebrow">Assignment</p>
                <h2>Write a short paper on whether process evidence is fairer than final-text AI detection.</h2>
              </div>
              <button className="primary" disabled={submitted} onClick={submitPaper}>
                Submit Paper
              </button>
            </section>

            <section className="workspace">
              <aside className="panel">
                <h3>Live Capture</h3>
                <dl className="metrics">
                  <div><dt>Words</dt><dd>{countWords(paperText)}</dd></div>
                  <div><dt>Active Time</dt><dd>{formatDuration(activeWritingMs(events))}</dd></div>
                  <div><dt>Paste Events</dt><dd>{pasteCount}</dd></div>
                  <div><dt>Deletion Events</dt><dd>{deletionCount}</dd></div>
                </dl>
                <p className="note">The editor records factual writing events for review after submission.</p>
              </aside>

              <section className="editor-shell">
                <label htmlFor="paper-editor">Paper</label>
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
                {observations.length ? (
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
                  <button onClick={playReplay}>{isPlaying ? "Pause" : "Play"}</button>
                </div>
                <input
                  id="replay-slider"
                  type="range"
                  min="0"
                  max={Math.max(0, snapshots.length - 1)}
                  value={replayIndex}
                  onChange={(event) => setReplayIndex(Number(event.target.value))}
                />
                <div className="replay-output">
                  {replayEvent ? `[${new Date(replayEvent.at).toLocaleTimeString()}] ${replayEvent.type.toUpperCase()}${replayEvent.addedWords ? `, ${replayEvent.addedWords} words added` : ""}\n\n` : ""}
                  {replaySnapshot?.text || ""}
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
              onChange={(event) => setSummaryDraft(event.target.value)}
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
