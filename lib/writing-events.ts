export type WritingEventType = "insert" | "delete" | "paste" | "submit";

export type WritingEvent = {
  id: string;
  type: WritingEventType;
  at: number;
  inputType?: string;
  start?: number;
  removed?: string;
  added?: string;
  removedCharacters?: number;
  addedWords?: number;
  removedWords?: number;
  durationSincePreviousMs?: number;
  pasteWords?: number;
  deletionEvent?: boolean;
  words?: number;
};

export type Snapshot = {
  at: number;
  text: string;
};

export type Observation = {
  group: "Major Event" | "Context Event" | "Typical Process Indicator" | "Comprehension Check";
  title: string;
  detail: string;
};

export type SessionMetrics = {
  totalEvents: number;
  editEvents: number;
  pasteEvents: number;
  deletionEvents: number;
  activeWritingMs: number;
  finalWordCount: number;
  firstEventAt: number | null;
  lastEventAt: number | null;
};

export function getDiff(previous: string, next: string) {
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

export function countWords(text: string) {
  return (text.trim().match(/\b[\w'-]+\b/g) || []).length;
}

export function countWordDelta(previous: string, next: string) {
  const previousWords = countWords(previous);
  const nextWords = countWords(next);
  return {
    addedWords: Math.max(0, nextWords - previousWords),
    removedWords: Math.max(0, previousWords - nextWords)
  };
}

export function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return minutes ? `${minutes}m ${remaining}s` : `${remaining}s`;
}

export function activeWritingMs(events: WritingEvent[]) {
  return events.reduce((total, event) => {
    if (!["insert", "delete", "paste"].includes(event.type)) return total;
    return total + Math.min(event.durationSincePreviousMs || 0, 30_000);
  }, 0);
}

export function calculateSessionMetrics(events: WritingEvent[], currentText: string): SessionMetrics {
  const orderedEvents = [...events].sort((a, b) => a.at - b.at);
  const editEvents = orderedEvents.filter((event) => ["insert", "delete", "paste"].includes(event.type));
  return {
    totalEvents: orderedEvents.length,
    editEvents: editEvents.length,
    pasteEvents: orderedEvents.filter((event) => event.type === "paste").length,
    deletionEvents: orderedEvents.filter((event) => event.type === "delete" || event.deletionEvent).length,
    activeWritingMs: activeWritingMs(orderedEvents),
    finalWordCount: countWords(currentText),
    firstEventAt: orderedEvents[0]?.at ?? null,
    lastEventAt: orderedEvents.at(-1)?.at ?? null
  };
}

export function analyzeProcess(events: WritingEvent[], submittedText: string): Observation[] {
  const observations: Observation[] = [];
  const activeMs = activeWritingMs(events);
  const finalWords = countWords(submittedText);
  const editEvents = events.filter((event) => ["insert", "delete", "paste"].includes(event.type));
  const deleteEvents = events.filter((event) => event.type === "delete" || (event.removedWords || 0) > 0);
  const deletionEvents = events.filter((event) => event.deletionEvent);
  const pasteEvents = events.filter((event) => event.type === "paste");

  pasteEvents.forEach((event) => {
    const words = event.pasteWords || event.addedWords || 0;
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
      detail: `${event.removedCharacters || 0} characters were deleted at ${new Date(event.at).toLocaleTimeString()}.`
    });
  });

  events.forEach((event) => {
    const wordsAdded = event.addedWords || event.pasteWords || 0;
    if ((event.durationSincePreviousMs || 0) > 20 * 60 * 1000 && wordsAdded >= 75) {
      observations.push({
        group: "Context Event",
        title: "Idle gap followed by insertion",
        detail: `${formatDuration(event.durationSincePreviousMs || 0)} elapsed before ${wordsAdded} words were added.`
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

export function analyzeComprehension(submittedText: string, summaryText: string): Observation {
  const paperKeywords = extractKeywords(submittedText);
  const summaryKeywords = new Set(extractKeywords(summaryText));
  const covered = paperKeywords.filter((word) => summaryKeywords.has(word));
  const missing = paperKeywords.filter((word) => !summaryKeywords.has(word)).slice(0, 6);

  return {
    group: "Comprehension Check",
    title: "Summary-to-paper keyword overlap",
    detail: `${covered.length} of ${paperKeywords.length} key paper terms appeared in the timed summary. Missing terms: ${missing.length ? missing.join(", ") : "none"}.`
  };
}

function extractKeywords(text: string) {
  const stopWords = new Set([
    "about", "after", "again", "also", "because", "before", "between", "could", "every",
    "from", "have", "into", "more", "should", "that", "their", "there", "these", "they",
    "this", "through", "what", "when", "where", "which", "while", "with", "would"
  ]);

  const counts = new Map<string, number>();
  (text.toLowerCase().match(/\b[a-z][a-z'-]{3,}\b/g) || []).forEach((word) => {
    if (!stopWords.has(word)) counts.set(word, (counts.get(word) || 0) + 1);
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([word]) => word);
}
