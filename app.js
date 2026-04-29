const state = {
  events: [],
  snapshots: [{ at: Date.now(), text: "" }],
  lastText: "",
  lastInputAt: null,
  startedAt: null,
  submittedAt: null,
  submittedText: "",
  summaryText: "",
  summaryStartedAt: null,
  summaryEndedAt: null,
  summaryTimer: null,
  replayTimer: null
};

const editor = document.querySelector("#paper-editor");
const summaryEditor = document.querySelector("#summary-editor");
const summaryDialog = document.querySelector("#summary-dialog");
const replaySlider = document.querySelector("#replay-slider");

const els = {
  wordCount: document.querySelector("#word-count"),
  activeTime: document.querySelector("#active-time"),
  pasteCount: document.querySelector("#paste-count"),
  deletionCount: document.querySelector("#deletion-count"),
  report: document.querySelector("#report"),
  replayOutput: document.querySelector("#replay-output"),
  timer: document.querySelector("#timer")
};

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
    tab.classList.add("active");
    document.querySelector(`#${tab.dataset.tab}`).classList.add("active");
    if (tab.dataset.tab === "professor") {
      renderReplay(Number(replaySlider.value));
    }
  });
});

editor.addEventListener("beforeinput", (event) => {
  if (!state.startedAt) state.startedAt = Date.now();
  state.pendingInputType = event.inputType;
});

editor.addEventListener("paste", (event) => {
  const pastedText = event.clipboardData.getData("text");
  state.pendingPaste = {
    text: pastedText,
    words: countWords(pastedText),
    at: Date.now()
  };
});

editor.addEventListener("input", () => {
  const now = Date.now();
  const nextText = editor.value;
  const diff = getDiff(state.lastText, nextText);
  const pasted = state.pendingPaste;
  const eventType = pasted ? "paste" : diff.added ? "insert" : "delete";

  recordEvent({
    type: eventType,
    at: now,
    inputType: state.pendingInputType || "unknown",
    start: diff.start,
    removed: diff.removed,
    added: diff.added,
    removedCharacters: diff.removed.length,
    addedWords: countWords(diff.added),
    removedWords: countWords(diff.removed),
    durationSincePreviousMs: state.lastInputAt ? now - state.lastInputAt : 0,
    pasteWords: pasted ? pasted.words : 0,
    deletionEvent: !pasted && diff.removed.length > 2
  });

  state.pendingPaste = null;
  state.pendingInputType = null;
  state.lastInputAt = now;
  state.lastText = nextText;
  state.snapshots.push({ at: now, text: nextText });
  updateLiveMetrics();
  syncReplayBounds();
});

document.querySelector("#submit-paper").addEventListener("click", () => {
  state.submittedAt = Date.now();
  state.submittedText = editor.value;
  editor.disabled = true;
  recordEvent({
    type: "submit",
    at: state.submittedAt,
    words: countWords(state.submittedText)
  });
  state.snapshots.push({ at: state.submittedAt, text: state.submittedText });
  updateLiveMetrics();
  syncReplayBounds();
  startSummaryCheck();
});

document.querySelector("#finish-summary").addEventListener("click", (event) => {
  event.preventDefault();
  completeSummaryCheck();
});

document.querySelector("#analyze").addEventListener("click", renderReport);

document.querySelector("#play-replay").addEventListener("click", () => {
  if (state.replayTimer) {
    clearInterval(state.replayTimer);
    state.replayTimer = null;
    return;
  }

  replaySlider.value = 0;
  renderReplay(0);
  state.replayTimer = setInterval(() => {
    const next = Number(replaySlider.value) + 1;
    if (next > Number(replaySlider.max)) {
      clearInterval(state.replayTimer);
      state.replayTimer = null;
      return;
    }
    replaySlider.value = String(next);
    renderReplay(next);
  }, 240);
});

replaySlider.addEventListener("input", () => renderReplay(Number(replaySlider.value)));

function recordEvent(event) {
  state.events.push({
    id: crypto.randomUUID(),
    ...event
  });
}

function getDiff(previous, next) {
  let start = 0;
  while (start < previous.length && start < next.length && previous[start] === next[start]) {
    start += 1;
  }

  let previousEnd = previous.length - 1;
  let nextEnd = next.length - 1;
  while (
    previousEnd >= start &&
    nextEnd >= start &&
    previous[previousEnd] === next[nextEnd]
  ) {
    previousEnd -= 1;
    nextEnd -= 1;
  }

  return {
    start,
    removed: previous.slice(start, previousEnd + 1),
    added: next.slice(start, nextEnd + 1)
  };
}

function countWords(text) {
  return (text.trim().match(/\b[\w'-]+\b/g) || []).length;
}

function formatDuration(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return minutes ? `${minutes}m ${remaining}s` : `${remaining}s`;
}

function activeWritingMs() {
  return state.events.reduce((total, event) => {
    if (!["insert", "delete", "paste"].includes(event.type)) return total;
    return total + Math.min(event.durationSincePreviousMs || 0, 30_000);
  }, 0);
}

function updateLiveMetrics() {
  els.wordCount.textContent = countWords(editor.value);
  els.pasteCount.textContent = state.events.filter((event) => event.type === "paste").length;
  els.deletionCount.textContent = state.events.filter((event) => event.deletionEvent).length;
  els.activeTime.textContent = formatDuration(activeWritingMs());
}

function syncReplayBounds() {
  replaySlider.max = String(Math.max(0, state.snapshots.length - 1));
}

function startSummaryCheck() {
  state.summaryStartedAt = Date.now();
  summaryEditor.value = "";
  summaryDialog.showModal();
  startTimer(120);
}

function startTimer(totalSeconds) {
  let remaining = totalSeconds;
  renderTimer(remaining);
  clearInterval(state.summaryTimer);
  state.summaryTimer = setInterval(() => {
    remaining -= 1;
    renderTimer(remaining);
    if (remaining <= 0) completeSummaryCheck();
  }, 1000);
}

function renderTimer(seconds) {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const remaining = String(seconds % 60).padStart(2, "0");
  els.timer.textContent = `${minutes}:${remaining}`;
}

function completeSummaryCheck() {
  clearInterval(state.summaryTimer);
  state.summaryTimer = null;
  state.summaryEndedAt = Date.now();
  state.summaryText = summaryEditor.value;
  if (summaryDialog.open) summaryDialog.close();
  renderReport();
  document.querySelector('[data-tab="professor"]').click();
}

function analyzeProcess() {
  const observations = [];
  const activeMs = activeWritingMs();
  const finalWords = countWords(state.submittedText || editor.value);
  const editEvents = state.events.filter((event) => ["insert", "delete", "paste"].includes(event.type));
  const deleteEvents = state.events.filter((event) => event.type === "delete" || event.removedWords > 0);
  const deletionEvents = state.events.filter((event) => event.deletionEvent);
  const pasteEvents = state.events.filter((event) => event.type === "paste");

  pasteEvents.forEach((event) => {
    const words = event.pasteWords || event.addedWords;
    if (words >= 200) {
      observations.push({
        group: "Major Event",
        title: "Large insertion",
        detail: `${words} words were inserted at ${new Date(event.at).toLocaleTimeString()} from a paste event.`
      });
    } else if (words >= 50) {
      observations.push({
        group: "Context Event",
        title: "Medium insertion",
        detail: `${words} words were inserted from a paste event.`
      });
    }
  });

  if (finalWords >= 200 && activeMs < 5 * 60 * 1000) {
    observations.push({
      group: "Major Event",
      title: "Low active writing time",
      detail: `${finalWords} submitted words with ${formatDuration(activeMs)} of active writing input.`
    });
  }

  if (finalWords >= 150 && deleteEvents.length === 0) {
    observations.push({
      group: "Major Event",
      title: "No revision activity",
      detail: "No deletions or text-removal revisions were recorded before submission."
    });
  }

  deletionEvents.forEach((event) => {
    observations.push({
      group: "Context Event",
      title: "Deletion event",
      detail: `${event.removedCharacters} characters were deleted at ${new Date(event.at).toLocaleTimeString()}.`
    });
  });

  state.events.forEach((event) => {
    if (event.durationSincePreviousMs > 20 * 60 * 1000 && (event.addedWords || event.pasteWords) >= 75) {
      observations.push({
        group: "Context Event",
        title: "Idle gap followed by insertion",
        detail: `${formatDuration(event.durationSincePreviousMs)} elapsed before ${event.addedWords || event.pasteWords} words were added.`
      });
    }
  });

  if (observations.length === 0 && editEvents.length > 0) {
    observations.push({
      group: "Typical Process Indicator",
      title: "Variable drafting activity",
      detail: "The event log contains smaller writing actions across the drafting session."
    });
  }

  return observations;
}

function extractKeywords(text) {
  const stopWords = new Set([
    "about", "after", "again", "also", "because", "before", "between", "could", "every",
    "from", "have", "into", "more", "should", "that", "their", "there", "these", "they",
    "this", "through", "what", "when", "where", "which", "while", "with", "would"
  ]);

  const counts = new Map();
  (text.toLowerCase().match(/\b[a-z][a-z'-]{3,}\b/g) || []).forEach((word) => {
    if (!stopWords.has(word)) counts.set(word, (counts.get(word) || 0) + 1);
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([word]) => word);
}

function analyzeComprehension() {
  const paperKeywords = extractKeywords(state.submittedText);
  const summaryKeywords = new Set(extractKeywords(state.summaryText));
  const covered = paperKeywords.filter((word) => summaryKeywords.has(word));
  const missing = paperKeywords.filter((word) => !summaryKeywords.has(word)).slice(0, 6);

  return {
    group: "Comprehension Check",
    title: "Summary-to-paper keyword overlap",
    detail: `${covered.length} of ${paperKeywords.length} key paper terms appeared in the timed summary. Missing terms: ${missing.length ? missing.join(", ") : "none"}.`
  };
}

function renderReport() {
  const hasSubmission = Boolean(state.submittedText || editor.value);
  if (!hasSubmission) {
    els.report.className = "report-empty";
    els.report.textContent = "Submit a paper and timed summary to generate a report.";
    return;
  }

  const observations = analyzeProcess();
  if (state.summaryText) observations.push(analyzeComprehension());

  els.report.className = "event-list";
  els.report.innerHTML = observations
    .map((item) => `
      <article class="event-card">
        <p class="eyebrow">${escapeHtml(item.group)}</p>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.detail)}</p>
      </article>
    `)
    .join("");
}

function renderReplay(index) {
  const snapshot = state.snapshots[index] || state.snapshots[0];
  const event = state.events[index - 1];
  const eventLine = event
    ? `[${new Date(event.at).toLocaleTimeString()}] ${event.type.toUpperCase()}${event.addedWords ? `, ${event.addedWords} words added` : ""}\n\n`
    : "";
  els.replayOutput.textContent = `${eventLine}${snapshot.text}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

updateLiveMetrics();
syncReplayBounds();
renderReplay(0);
