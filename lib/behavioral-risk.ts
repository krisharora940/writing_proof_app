import { activeWritingMs, countWords, formatDuration, type Observation, type WritingEvent } from "./writing-events.ts";

export type BehavioralSignalSeverity = "high" | "medium" | "positive";

export type BehavioralRiskSignal = {
  id: string;
  severity: BehavioralSignalSeverity;
  label: string;
  detail: string;
  eventId?: string;
  at?: number;
  points: number;
};

export type BehavioralRiskSummary = {
  totalPoints: number;
  highCount: number;
  mediumCount: number;
  positiveCount: number;
  signals: BehavioralRiskSignal[];
};

const HIGH_POINTS = 3;
const MEDIUM_POINTS = 1;
const POSITIVE_POINTS = -1;

export function analyzeBehavioralRisk(events: WritingEvent[], submittedText: string): BehavioralRiskSummary {
  const orderedEvents = [...events].sort((a, b) => a.at - b.at);
  const finalWords = countWords(submittedText);
  const editEvents = orderedEvents.filter((event) => ["insert", "delete", "paste"].includes(event.type));
  const firstEditAt = editEvents[0]?.at ?? null;
  const lastEditAt = editEvents.at(-1)?.at ?? null;
  const elapsedMs = firstEditAt !== null && lastEditAt !== null ? Math.max(0, lastEditAt - firstEditAt) : 0;
  const activeMs = activeWritingMs(orderedEvents);
  const deletionWords = orderedEvents.reduce((total, event) => total + (event.removedWords || 0), 0);
  const pasteEvents = orderedEvents.filter((event) => event.type === "paste");
  const signals: BehavioralRiskSignal[] = [];

  pasteEvents.forEach((event) => {
    const words = event.pasteWords || event.addedWords || countWords(event.added || "");
    const ratio = finalWords ? words / finalWords : 0;
    if (finalWords >= 100 && ratio > 0.2) {
      signals.push(signal({
        id: `high-paste-ratio-${event.id}`,
        severity: "high",
        label: "Large paste share",
        detail: `${words} pasted words represented ${formatPercent(ratio)} of the submitted essay.`,
        event
      }));
    } else if (words >= 50 && words <= 200) {
      signals.push(signal({
        id: `medium-paste-${event.id}`,
        severity: "medium",
        label: "Medium paste event",
        detail: `${words} words were inserted through one paste event.`,
        event
      }));
    }
  });

  if (finalWords >= 150) {
    const deletionRate = deletionWords / finalWords;
    if (deletionRate < 0.01) {
      signals.push(signal({
        id: "high-low-word-deletion-rate",
        severity: "high",
        label: "Low word-removal rate",
        detail: `${deletionWords} removed words were recorded for ${finalWords} submitted words.`
      }));
    }
  }

  if (elapsedMs >= 60_000) {
    const activeRatio = activeMs / elapsedMs;
    if (finalWords >= 150 && activeRatio < 0.1) {
      signals.push(signal({
        id: "high-low-active-typing-share",
        severity: "high",
        label: "Low active typing share",
        detail: `${formatDuration(activeMs)} of active writing was recorded across ${formatDuration(elapsedMs)} of session time.`
      }));
    }
  }

  const sustainedWpm = findSustainedTypingSpeed(orderedEvents);
  if (sustainedWpm) {
    signals.push(signal({
      id: "medium-sustained-high-wpm",
      severity: "medium",
      label: "High sustained typing speed",
      detail: `${sustainedWpm.words} typed words were recorded over ${formatDuration(sustainedWpm.durationMs)}, about ${Math.round(sustainedWpm.wpm)} WPM.`
    }));
  }

  if (finalWords >= 150 && spansSingleDay(editEvents)) {
    signals.push(signal({
      id: "medium-single-day-session",
      severity: "medium",
      label: "Single-day drafting span",
      detail: "The recorded writing activity for this submission occurred within one calendar day."
    }));
  }

  if (spansMultipleDays(editEvents)) {
    signals.push(signal({
      id: "positive-multiple-day-span",
      severity: "positive",
      label: "Multiple-day writing span",
      detail: "Recorded writing activity spans more than one calendar day."
    }));
  }

  if (hasPauseEditRetypePattern(orderedEvents)) {
    signals.push(signal({
      id: "positive-pause-edit-retype",
      severity: "positive",
      label: "Pause-edit-retype pattern",
      detail: "The event log includes pauses followed by revision and new typed text."
    }));
  }

  if (hasNonLinearOffsets(orderedEvents)) {
    signals.push(signal({
      id: "positive-nonlinear-writing",
      severity: "positive",
      label: "Non-linear section editing",
      detail: "Writing activity returned to earlier document sections before submission."
    }));
  }

  const averageTypingWpm = averageTypedWpm(orderedEvents);
  if (averageTypingWpm !== null && averageTypingWpm >= 30 && averageTypingWpm <= 100) {
    signals.push(signal({
      id: "positive-typical-average-wpm",
      severity: "positive",
      label: "Typical average typing pace",
      detail: `Typed-word pace averaged about ${Math.round(averageTypingWpm)} WPM, excluding paste events.`
    }));
  }

  return summarize(signals);
}

export function behavioralSignalsToObservations(signals: BehavioralRiskSignal[]): Observation[] {
  return signals.map((item) => ({
    group: item.severity === "positive" ? "Typical Process Indicator" : item.severity === "high" ? "Major Event" : "Context Event",
    title: item.label,
    detail: item.detail
  }));
}

function signal(input: {
  id: string;
  severity: BehavioralSignalSeverity;
  label: string;
  detail: string;
  event?: WritingEvent;
}): BehavioralRiskSignal {
  return {
    id: input.id,
    severity: input.severity,
    label: input.label,
    detail: input.detail,
    eventId: input.event?.id,
    at: input.event?.at,
    points: input.severity === "high" ? HIGH_POINTS : input.severity === "medium" ? MEDIUM_POINTS : POSITIVE_POINTS
  };
}

function summarize(signals: BehavioralRiskSignal[]): BehavioralRiskSummary {
  return {
    totalPoints: Math.max(0, signals.reduce((total, item) => total + item.points, 0)),
    highCount: signals.filter((item) => item.severity === "high").length,
    mediumCount: signals.filter((item) => item.severity === "medium").length,
    positiveCount: signals.filter((item) => item.severity === "positive").length,
    signals
  };
}

function findSustainedTypingSpeed(events: WritingEvent[]) {
  const typedEvents = events.filter((event) => event.type === "insert" && (event.addedWords || 0) > 0);
  for (let start = 0; start < typedEvents.length; start += 1) {
    let words = 0;
    for (let end = start; end < typedEvents.length; end += 1) {
      words += typedEvents[end].addedWords || 0;
      const durationMs = typedEvents[end].at - typedEvents[start].at;
      if (durationMs >= 60_000) {
        const wpm = words / (durationMs / 60_000);
        if (wpm > 120) return { words, durationMs, wpm };
      }
    }
  }
  return null;
}

function averageTypedWpm(events: WritingEvent[]) {
  const typedEvents = events.filter((event) => event.type === "insert");
  const words = typedEvents.reduce((total, event) => total + (event.addedWords || 0), 0);
  const activeMs = typedEvents.reduce((total, event) => total + Math.min(event.durationSincePreviousMs || 0, 30_000), 0);
  if (!words || activeMs < 60_000) return null;
  return words / (activeMs / 60_000);
}

function spansSingleDay(events: WritingEvent[]) {
  if (events.length < 2) return false;
  return dayKey(events[0].at) === dayKey(events.at(-1)?.at || events[0].at);
}

function spansMultipleDays(events: WritingEvent[]) {
  if (events.length < 2) return false;
  return dayKey(events[0].at) !== dayKey(events.at(-1)?.at || events[0].at);
}

function dayKey(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function hasPauseEditRetypePattern(events: WritingEvent[]) {
  return events.some((event, index) => {
    if (event.type !== "delete" && !event.deletionEvent) return false;
    const next = events.slice(index + 1).find((candidate) => candidate.type === "insert" && (candidate.addedWords || 0) > 0);
    return Boolean(next && (next.durationSincePreviousMs || 0) >= 5_000);
  });
}

function hasNonLinearOffsets(events: WritingEvent[]) {
  let furthestStart = 0;
  return events.some((event) => {
    if (typeof event.start !== "number") return false;
    const movedBack = event.start + 100 < furthestStart;
    furthestStart = Math.max(furthestStart, event.start);
    return movedBack;
  });
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}
