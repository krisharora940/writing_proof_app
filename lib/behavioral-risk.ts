import { activeWritingMs, countWords, formatDuration, type Observation, type WritingEvent } from "./writing-events.ts";
import {
  extractProcessFeatures,
  hasLargeUnrevisedNearSubmissionInsertion
} from "./process-features.ts";

const MEANINGFUL_TYPING_GAP_MS = 10_000;
const MIN_MEANINGFUL_TYPED_CHARACTERS = 10;
const TYPED_CHARACTERS_PER_WORD = 5;

export type BehavioralSignalSeverity = "high" | "medium" | "positive";

export type BehavioralRiskSignal = {
  id: string;
  severity: BehavioralSignalSeverity;
  label: string;
  detail: string;
  eventId?: string;
  at?: number;
};

export type BehavioralRiskSummary = {
  highCount: number;
  mediumCount: number;
  positiveCount: number;
  signals: BehavioralRiskSignal[];
};

export function analyzeBehavioralRisk(events: WritingEvent[], submittedText: string): BehavioralRiskSummary {
  const orderedEvents = [...events].sort((a, b) => a.at - b.at);
  const finalWords = countWords(submittedText);
  const editEvents = orderedEvents.filter((event) => ["insert", "delete", "paste"].includes(event.type));
  const firstEditAt = editEvents[0]?.at ?? null;
  const lastEditAt = editEvents.at(-1)?.at ?? null;
  const elapsedMs = firstEditAt !== null && lastEditAt !== null ? Math.max(0, lastEditAt - firstEditAt) : 0;
  const activeMs = activeWritingMs(orderedEvents);
  const pasteEvents = orderedEvents.filter((event) => event.type === "paste");
  const processFeatures = extractProcessFeatures({ events: orderedEvents, submittedText });
  const signals: BehavioralRiskSignal[] = [];

  pasteEvents.forEach((event) => {
    const words = event.pasteWords || event.addedWords || countWords(event.added || "");
    const ratio = finalWords ? words / finalWords : 0;
    if (finalWords >= 100 && ratio >= 0.3) {
      signals.push(signal({
        id: `high-paste-ratio-${event.id}`,
        severity: "high",
        label: "Large paste share",
        detail: `${words} pasted words represented ${formatPercent(ratio)} of the submitted essay.`,
        event
      }));
    } else if (words >= 120) {
      signals.push(signal({
        id: `medium-large-paste-${event.id}`,
        severity: "medium",
        label: "Large paste event",
        detail: `${words} words were inserted through one paste event.`,
        event
      }));
    } else if (words >= 50 && words <= 119) {
      signals.push(signal({
        id: `medium-paste-${event.id}`,
        severity: "medium",
        label: "Medium paste event",
        detail: `${words} words were inserted through one paste event.`,
        event
      }));
    }
  });

  const totalPastedWords = pasteEvents.reduce((total, event) => total + (event.pasteWords || event.addedWords || countWords(event.added || "")), 0);
  const pasteShare = finalWords ? totalPastedWords / finalWords : 0;
  if (pasteEvents.length >= 2 && finalWords >= 150 && pasteShare >= 0.35) {
    signals.push(signal({
      id: "high-repeated-paste-share",
      severity: "high",
      label: "Repeated paste-heavy drafting",
      detail: `${pasteEvents.length} paste events contributed ${formatPercent(pasteShare)} of the final submission.`
    }));
  }

  const minimalRevisionInteraction = finalWords >= 150 &&
    processFeatures.revisionDepthScore <= 2 &&
    hasLargeUnrevisedNearSubmissionInsertion(processFeatures);
  if (minimalRevisionInteraction) {
    signals.push(signal({
      id: "high-minimal-revision-after-large-insertion",
      severity: "high",
      label: "Minimal revision after large insertion",
      detail: `${processFeatures.revisedWordsEstimate} revised words were estimated after a large or heavily retained insertion.`
    }));
  }

  if (processFeatures.structuralRevisionCount > 0) {
    signals.push(signal({
      id: "positive-structural-revision",
      severity: "positive",
      label: "Structural revision activity",
      detail: `${processFeatures.structuralRevisionCount} structural revision event${processFeatures.structuralRevisionCount === 1 ? "" : "s"} changed larger sections of the draft.`
    }));
  } else if (processFeatures.localRevisionCount >= 2) {
    signals.push(signal({
      id: "positive-local-revision",
      severity: "positive",
      label: "Meaningful local revision",
      detail: `${processFeatures.localRevisionCount} local revision events changed words, phrases, or sentences.`
    }));
  }

  if (processFeatures.revisedRegionCount >= 3) {
    signals.push(signal({
      id: "positive-multi-region-revision",
      severity: "positive",
      label: "Revision across document regions",
      detail: `Revision activity was recorded across ${processFeatures.revisedRegionCount} document regions.`
    }));
  }

  if (processFeatures.paragraphReorderCount > 0) {
    signals.push(signal({
      id: "positive-paragraph-reordering",
      severity: "positive",
      label: "Paragraph reordering",
      detail: `${processFeatures.paragraphReorderCount} paragraph reorder pattern${processFeatures.paragraphReorderCount === 1 ? "" : "s"} was estimated.`
    }));
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
      id: sustainedWpm.wpm >= 145 ? "high-sustained-very-high-wpm" : "medium-sustained-high-wpm",
      severity: sustainedWpm.wpm >= 145 ? "high" : "medium",
      label: sustainedWpm.wpm >= 145 ? "Very high sustained typing speed" : "High sustained typing speed",
      detail: `${sustainedWpm.words} typed words were recorded over ${formatDuration(sustainedWpm.durationMs)}, about ${Math.round(sustainedWpm.wpm)} WPM.`
    }));
  }

  const sessionPattern = detectDraftingSessions(editEvents);
  if (sessionPattern.sessionCount >= 2) {
    signals.push(signal({
      id: "positive-multi-session-drafting",
      severity: "positive",
      label: "Multi-session drafting",
      detail: `Recorded writing activity appears across ${sessionPattern.sessionCount} writing sessions with breaks up to ${formatDuration(sessionPattern.longestGapMs)}.`
    }));
  }

  if (processFeatures.returnedToRevise) {
    signals.push(signal({
      id: "positive-returned-to-revise",
      severity: "positive",
      label: "Returned in a later session to revise",
      detail: `${processFeatures.laterSessionRevisionCount} later writing session${processFeatures.laterSessionRevisionCount === 1 ? "" : "s"} included revision activity.`
    }));
  }

  if (sessionPattern.sessionCount >= 3 || sessionPattern.longestGapMs >= 90 * 60 * 1000) {
    signals.push(signal({
      id: "positive-extended-drafting-gaps",
      severity: "positive",
      label: "Extended drafting gaps",
      detail: "The writing log includes longer pauses between drafting sessions, which is often consistent with staged revision."
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

  const revisionBursts = countRevisionBursts(orderedEvents);
  if (revisionBursts >= 3) {
    signals.push(signal({
      id: "positive-repeated-revision-bursts",
      severity: "positive",
      label: "Repeated revision cycles",
      detail: `${revisionBursts} revision cycles were recorded across the drafting session.`
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
    at: input.event?.at
  };
}

function summarize(signals: BehavioralRiskSignal[]): BehavioralRiskSummary {
  return {
    highCount: signals.filter((item) => item.severity === "high").length,
    mediumCount: signals.filter((item) => item.severity === "medium").length,
    positiveCount: signals.filter((item) => item.severity === "positive").length,
    signals
  };
}

function findSustainedTypingSpeed(events: WritingEvent[]) {
  const typedEvents = events.filter((event) => event.type === "insert" && (event.addedWords || 0) > 0);
  for (let start = 0; start < typedEvents.length; start += 1) {
    let characters = 0;
    let previous = typedEvents[start];
    for (let end = start; end < typedEvents.length; end += 1) {
      const current = typedEvents[end];
      if (end > start && current.at - previous.at > MEANINGFUL_TYPING_GAP_MS) break;
      characters += addedCharacters(current);
      previous = current;
      const durationMs = current.at - typedEvents[start].at;
      if (durationMs >= 60_000) {
        if (characters < MIN_MEANINGFUL_TYPED_CHARACTERS) continue;
        const words = characters / TYPED_CHARACTERS_PER_WORD;
        const wpm = words / (durationMs / 60_000);
        if (wpm > 110) return { words, durationMs, wpm };
      }
    }
  }
  return null;
}

function averageTypedWpm(events: WritingEvent[]) {
  const typedEvents = events.filter((event) => event.type === "insert");
  const characters = typedEvents.reduce((total, event) => total + addedCharacters(event), 0);
  const activeMs = typedEvents.reduce((total, event) => total + Math.min(event.durationSincePreviousMs || 0, 30_000), 0);
  if (!characters || activeMs < 60_000 || characters < MIN_MEANINGFUL_TYPED_CHARACTERS) return null;
  return (characters / TYPED_CHARACTERS_PER_WORD) / (activeMs / 60_000);
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

function countRevisionBursts(events: WritingEvent[]) {
  let bursts = 0;
  for (let index = 0; index < events.length - 1; index += 1) {
    const current = events[index];
    const next = events[index + 1];
    const currentRemoved = current.removedWords || countWords(current.removed || "");
    if ((current.type === "delete" || currentRemoved > 0) && next.type === "insert" && (next.addedWords || 0) > 0) {
      bursts += 1;
    }
  }
  return bursts;
}

function detectDraftingSessions(events: WritingEvent[]) {
  if (!events.length) return { sessionCount: 0, longestGapMs: 0 };
  let sessionCount = 1;
  let longestGapMs = 0;
  for (let index = 1; index < events.length; index += 1) {
    const current = events[index];
    const previous = events[index - 1];
    const gapMs = Math.max(current.at - previous.at, current.durationSincePreviousMs || 0);
    longestGapMs = Math.max(longestGapMs, gapMs);
    if (gapMs >= 25 * 60 * 1000) {
      sessionCount += 1;
    }
  }
  return { sessionCount, longestGapMs };
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function addedCharacters(event: WritingEvent) {
  const explicit = (event.added || "").replace(/\s/g, "").length;
  if (explicit > 0) return explicit;
  return (event.addedWords || 0) * 5;
}
