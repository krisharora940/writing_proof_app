import { countWords, type WritingEvent } from "./writing-events.ts";
import { analyzePasteRetention } from "./paste-retention.ts";

export type DraftBuildPoint = {
  elapsedPercent: 0 | 25 | 50 | 75 | 100;
  at: number | null;
  words: number;
};

export type ProcessFeatures = {
  finalWords: number;
  totalDurationMs: number;
  activeDurationMs: number;
  overallWpm: number;
  activeWpm: number;
  burstWpm: number;
  maxRollingOneMinuteWpm: number;
  maxRollingTwoMinuteWpm: number;
  wordsAt25PercentTime: number;
  wordsAt50PercentTime: number;
  wordsAt75PercentTime: number;
  pasteEventCount: number;
  pastedWords: number;
  pastedFinalWordsEstimate: number;
  typedFinalWordsEstimate: number;
  typedFinalRatio: number;
  pastedFinalRatio: number;
  unrevisedPastedFinalWordsEstimate: number;
  revisedPastedFinalWordsEstimate: number;
  unrevisedPasteFinalRatio: number;
  rewrittenPastedWordsEstimate: number;
  deletionEventCount: number;
  deletedWords: number;
  deletedTypedWordsEstimate: number;
  deletedPastedWordsEstimate: number;
  deletionToFinalRatio: number;
  replacementEventCount: number;
  surfaceRevisionCount: number;
  localRevisionCount: number;
  structuralRevisionCount: number;
  sentenceLevelRevisionCount: number;
  smallEditCount: number;
  largeDeletionCount: number;
  paragraphReorderCount: number;
  revisedRegionCount: number;
  revisedWordsEstimate: number;
  revisionAfterPasteCount: number;
  revisionDensity: number;
  revisionDepthScore: number;
  sessionCount: number;
  meaningfulSessionCount: number;
  laterSessionRevisionCount: number;
  returnedToRevise: boolean;
  longestIdleGapMs: number;
  pauseCountOver30Seconds: number;
  pauseCountOverTwoMinutes: number;
  medianPauseMs: number;
  largestInsertionWords: number;
  largestInsertionFinalRatio: number;
  pauseBeforeLargestInsertionMs: number | null;
  pauseAfterLargestInsertionMs: number | null;
  timeFromLargestInsertionToSubmitMs: number | null;
  timeFromCompleteDraftToSubmitMs: number | null;
  immediateSubmissionAfterCompleteDraft: boolean;
  draftBuildCurve: DraftBuildPoint[];
};

const ACTIVE_GAP_MS = 90_000;
const SESSION_GAP_MS = 25 * 60_000;
const MEANINGFUL_TYPING_GAP_MS = 10_000;
const MIN_MEANINGFUL_TYPED_CHARACTERS = 10;
const TYPED_CHARACTERS_PER_WORD = 5;

export function extractProcessFeatures(input: {
  events: WritingEvent[];
  submittedText: string;
  submittedAt?: number | null;
}): ProcessFeatures {
  const orderedEvents = [...input.events].sort((a, b) => a.at - b.at);
  const editEvents = orderedEvents.filter(isEditEvent);
  const finalWords = countWords(input.submittedText);
  const firstEditAt = editEvents[0]?.at ?? null;
  const lastEditAt = editEvents.at(-1)?.at ?? null;
  const submitEventAt = orderedEvents.findLast((event) => event.type === "submit")?.at ?? null;
  const submittedAt = input.submittedAt ?? submitEventAt ?? lastEditAt;
  const totalDurationMs = firstEditAt !== null && submittedAt !== null
    ? Math.max(0, submittedAt - firstEditAt)
    : 0;
  const activeDurationMs = calculateActiveDuration(editEvents);
  const typingRuns = buildMeaningfulTypingRuns(editEvents);
  const typedCharacters = typingRuns.reduce((total, run) => total + run.characters, 0);
  const typedWordsEquivalent = typedCharacters / TYPED_CHARACTERS_PER_WORD;
  const meaningfulTypedDurationMs = typingRuns.reduce((total, run) => total + run.durationMs, 0);
  const pasteEvents = editEvents.filter((event) => event.type === "paste");
  const pastedWords = pasteEvents.reduce((total, event) => total + addedWords(event), 0);
  const pasteRetention = pasteEvents.map((event) => ({
    event,
    retention: analyzePasteRetention(event, input.submittedText)
  }));
  const pastedFinalWordsEstimate = pasteRetention.reduce(
    (total, item) => total + item.retention.retainedWordsEstimate,
    0
  );
  const unrevisedPastedFinalWordsEstimate = pasteRetention.reduce(
    (total, item) => total + (item.retention.overlapRatio >= 0.85 ? item.retention.retainedWordsEstimate : 0),
    0
  );
  const rewrittenPastedWordsEstimate = pasteRetention.reduce(
    (total, item) => total + (
      item.event.added?.trim()
        ? Math.max(0, item.retention.pastedWords - item.retention.retainedWordsEstimate)
        : 0
    ),
    0
  );
  const cappedPastedFinalWords = Math.min(finalWords, pastedFinalWordsEstimate);
  const cappedUnrevisedPastedWords = Math.min(finalWords, unrevisedPastedFinalWordsEstimate);
  const typedFinalWordsEstimate = Math.max(0, finalWords - cappedPastedFinalWords);
  const revisedPastedFinalWordsEstimate = Math.max(0, cappedPastedFinalWords - cappedUnrevisedPastedWords);
  const deletedWords = editEvents.reduce((total, event) => total + removedWords(event), 0);
  const deletionProvenance = estimateDeletionProvenance(editEvents);
  const revisionProfile = analyzeRevisionDepth(editEvents, finalWords, rewrittenPastedWordsEstimate);
  const revisedRegionCount = countRevisedRegions(editEvents, input.submittedText.length);
  const largestInsertion = editEvents.reduce<WritingEvent | null>((largest, event) => {
    if (!largest || addedWords(event) > addedWords(largest)) return event;
    return largest;
  }, null);
  const sessionGroups = splitSessions(editEvents);
  const laterSessionRevisionCount = sessionGroups.slice(1).filter((session) => (
    session.some((event) => removedWords(event) > 0)
  )).length;
  const enrichedRevisionDepthScore = Math.min(
    20,
    revisionProfile.revisionDepthScore +
      revisionProfile.paragraphReorderCount * 3 +
      Math.max(0, revisedRegionCount - 1) * 2
  );
  const buildCurve = createDraftBuildCurve(editEvents, finalWords, firstEditAt, submittedAt);
  const pauses = pauseDurations(editEvents);
  const largestInsertionIndex = largestInsertion
    ? editEvents.findIndex((event) => event.id === largestInsertion.id)
    : -1;
  const completeDraftAt = findCompleteDraftAt(editEvents, finalWords);
  const timeFromCompleteDraftToSubmitMs = completeDraftAt !== null && submittedAt !== null
    ? Math.max(0, submittedAt - completeDraftAt)
    : null;

  return {
    finalWords,
    totalDurationMs,
    activeDurationMs,
    overallWpm: ratePerMinute(finalWords, totalDurationMs),
    activeWpm: ratePerMinute(typedWordsEquivalent, meaningfulTypedDurationMs),
    burstWpm: maxTypedWindowWpm(editEvents, 15_000),
    maxRollingOneMinuteWpm: maxTypedWindowWpm(editEvents, 60_000),
    maxRollingTwoMinuteWpm: maxTypedWindowWpm(editEvents, 120_000),
    wordsAt25PercentTime: buildCurve[1].words,
    wordsAt50PercentTime: buildCurve[2].words,
    wordsAt75PercentTime: buildCurve[3].words,
    pasteEventCount: pasteEvents.length,
    pastedWords,
    pastedFinalWordsEstimate: cappedPastedFinalWords,
    typedFinalWordsEstimate,
    typedFinalRatio: ratio(typedFinalWordsEstimate, finalWords),
    pastedFinalRatio: ratio(cappedPastedFinalWords, finalWords),
    unrevisedPastedFinalWordsEstimate: cappedUnrevisedPastedWords,
    revisedPastedFinalWordsEstimate,
    unrevisedPasteFinalRatio: ratio(unrevisedPastedFinalWordsEstimate, finalWords),
    rewrittenPastedWordsEstimate: Math.min(finalWords, rewrittenPastedWordsEstimate),
    deletionEventCount: editEvents.filter((event) => event.type === "delete" || event.deletionEvent).length,
    deletedWords,
    deletedTypedWordsEstimate: deletionProvenance.typed,
    deletedPastedWordsEstimate: deletionProvenance.pasted,
    deletionToFinalRatio: ratio(deletedWords, finalWords),
    replacementEventCount: revisionProfile.replacementEventCount,
    surfaceRevisionCount: revisionProfile.surfaceRevisionCount,
    localRevisionCount: revisionProfile.localRevisionCount,
    structuralRevisionCount: revisionProfile.structuralRevisionCount,
    sentenceLevelRevisionCount: revisionProfile.sentenceLevelRevisionCount,
    smallEditCount: revisionProfile.smallEditCount,
    largeDeletionCount: revisionProfile.largeDeletionCount,
    paragraphReorderCount: revisionProfile.paragraphReorderCount,
    revisedRegionCount,
    revisedWordsEstimate: revisionProfile.revisedWordsEstimate,
    revisionAfterPasteCount: countRevisionsAfterPaste(editEvents),
    revisionDensity: revisionProfile.revisionDensity,
    revisionDepthScore: enrichedRevisionDepthScore,
    sessionCount: sessionGroups.length,
    meaningfulSessionCount: sessionGroups.filter(isMeaningfulSession).length,
    laterSessionRevisionCount,
    returnedToRevise: laterSessionRevisionCount > 0,
    longestIdleGapMs: longestIdleGap(editEvents),
    pauseCountOver30Seconds: pauses.filter((pause) => pause >= 30_000).length,
    pauseCountOverTwoMinutes: pauses.filter((pause) => pause >= 2 * 60_000).length,
    medianPauseMs: median(pauses),
    largestInsertionWords: largestInsertion ? addedWords(largestInsertion) : 0,
    largestInsertionFinalRatio: ratio(largestInsertion ? addedWords(largestInsertion) : 0, finalWords),
    pauseBeforeLargestInsertionMs: largestInsertionIndex >= 0
      ? gapBefore(editEvents, largestInsertionIndex)
      : null,
    pauseAfterLargestInsertionMs: largestInsertionIndex >= 0 && largestInsertionIndex < editEvents.length - 1
      ? gapBefore(editEvents, largestInsertionIndex + 1)
      : null,
    timeFromLargestInsertionToSubmitMs: largestInsertion && submittedAt !== null
      ? Math.max(0, submittedAt - largestInsertion.at)
      : null,
    timeFromCompleteDraftToSubmitMs,
    immediateSubmissionAfterCompleteDraft: finalWords >= 100 &&
      timeFromCompleteDraftToSubmitMs !== null &&
      timeFromCompleteDraftToSubmitMs < 2 * 60_000,
    draftBuildCurve: buildCurve
  };
}

export function hasLargeUnrevisedNearSubmissionInsertion(features: ProcessFeatures) {
  return features.largestInsertionFinalRatio >= 0.5 &&
    features.unrevisedPasteFinalRatio >= 0.4 &&
    features.timeFromLargestInsertionToSubmitMs !== null &&
    features.timeFromLargestInsertionToSubmitMs < 10 * 60_000;
}

function analyzeRevisionDepth(events: WritingEvent[], finalWords: number, rewrittenPastedWordsEstimate: number) {
  const revisionEvents = events.filter((event) => removedWords(event) > 0);
  const replacementEvents = revisionEvents.filter((event) => addedWords(event) > 0);
  let surfaceRevisionCount = 0;
  let localRevisionCount = 0;
  let structuralRevisionCount = 0;
  let sentenceLevelRevisionCount = 0;
  let smallEditCount = 0;
  let largeDeletionCount = 0;
  let paragraphReorderCount = 0;
  let revisedWordsEstimate = 0;

  revisionEvents.forEach((event) => {
    const removed = removedWords(event);
    const added = addedWords(event);
    const changed = Math.max(removed, added);
    revisedWordsEstimate += changed;

    if (changed <= 2 && isSurfaceChange(event)) {
      surfaceRevisionCount += 1;
    } else if (changed >= 30 || removed >= 30) {
      structuralRevisionCount += 1;
    } else {
      localRevisionCount += 1;
    }

    if (changed >= 8) sentenceLevelRevisionCount += 1;
    if (changed <= 3) smallEditCount += 1;
    if (removed >= 30) largeDeletionCount += 1;
    if (isParagraphReorder(event)) paragraphReorderCount += 1;
  });

  revisedWordsEstimate = Math.max(revisedWordsEstimate, rewrittenPastedWordsEstimate);
  if (rewrittenPastedWordsEstimate >= 30 && structuralRevisionCount === 0) {
    structuralRevisionCount = 1;
  } else if (rewrittenPastedWordsEstimate >= 3 && localRevisionCount === 0) {
    localRevisionCount = 1;
  }
  if (rewrittenPastedWordsEstimate >= 8 && sentenceLevelRevisionCount === 0) {
    sentenceLevelRevisionCount = 1;
  }

  const revisionDensity = ratio(revisedWordsEstimate, finalWords);
  const revisionDepthScore = Math.min(20, Math.round(
    Math.min(6, surfaceRevisionCount) * 0.5 +
    Math.min(5, localRevisionCount) * 2 +
    Math.min(3, structuralRevisionCount) * 5 +
    Math.min(4, replacementEvents.length) +
    Math.min(5, revisionDensity * 10)
  ));

  return {
    replacementEventCount: replacementEvents.length,
    surfaceRevisionCount,
    localRevisionCount,
    structuralRevisionCount,
    sentenceLevelRevisionCount,
    smallEditCount,
    largeDeletionCount,
    paragraphReorderCount,
    revisedWordsEstimate: Math.min(finalWords, revisedWordsEstimate),
    revisionDensity,
    revisionDepthScore
  };
}

function isSurfaceChange(event: WritingEvent) {
  const removed = event.removed || "";
  const added = event.added || "";
  if (!removed && !added) return true;
  const normalizedRemoved = removed.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalizedAdded = added.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalizedRemoved === normalizedAdded || countWords(removed) <= 1;
}

function createDraftBuildCurve(
  events: WritingEvent[],
  finalWords: number,
  firstEditAt: number | null,
  submittedAt: number | null
): DraftBuildPoint[] {
  const percents = [0, 25, 50, 75, 100] as const;
  if (firstEditAt === null || submittedAt === null) {
    return percents.map((elapsedPercent) => ({
      elapsedPercent,
      at: null,
      words: elapsedPercent === 100 ? finalWords : 0
    }));
  }

  const duration = Math.max(0, submittedAt - firstEditAt);
  let runningWords = 0;
  const cumulative = events.map((event) => {
    runningWords = Math.max(0, runningWords + addedWords(event) - removedWords(event));
    return { at: event.at, words: runningWords };
  });

  return percents.map((elapsedPercent) => {
    const at = firstEditAt + duration * (elapsedPercent / 100);
    const latest = cumulative.findLast((point) => point.at <= at);
    return {
      elapsedPercent,
      at: Math.round(at),
      words: elapsedPercent === 0
        ? 0
        : elapsedPercent === 100
          ? finalWords
          : Math.min(finalWords, latest?.words ?? 0)
    };
  });
}

function calculateActiveDuration(events: WritingEvent[]) {
  return events.reduce((total, event, index) => {
    const previous = events[index - 1];
    const gap = event.durationSincePreviousMs
      ?? (previous ? Math.max(0, event.at - previous.at) : 0);
    return total + Math.min(ACTIVE_GAP_MS, Math.max(0, gap));
  }, 0);
}

function maxTypedWindowWpm(events: WritingEvent[], windowMs: number) {
  let maximum = 0;
  const typedEvents = events.filter((event) => event.type === "insert");
  typedEvents.forEach((event, startIndex) => {
    const windowEnd = event.at + windowMs;
    let characters = 0;
    let previous = typedEvents[startIndex];
    for (let index = startIndex; index < typedEvents.length; index += 1) {
      const candidate = typedEvents[index];
      if (candidate.at > windowEnd) break;
      if (index > startIndex && candidate.at - previous.at > MEANINGFUL_TYPING_GAP_MS) break;
      characters += addedCharacters(candidate);
      previous = candidate;
    }
    if (characters < MIN_MEANINGFUL_TYPED_CHARACTERS) return;
    maximum = Math.max(maximum, ratePerMinute(characters / TYPED_CHARACTERS_PER_WORD, windowMs));
  });
  return maximum;
}

function pauseDurations(events: WritingEvent[]) {
  return events.slice(1).map((event, index) => {
    const previous = events[index];
    return Math.max(0, event.at - previous.at, event.durationSincePreviousMs || 0);
  });
}

function gapBefore(events: WritingEvent[], index: number) {
  if (index <= 0 || index >= events.length) return 0;
  const event = events[index];
  return Math.max(0, event.at - events[index - 1].at, event.durationSincePreviousMs || 0);
}

function median(values: number[]) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : Math.round((ordered[middle - 1] + ordered[middle]) / 2);
}

function findCompleteDraftAt(events: WritingEvent[], finalWords: number) {
  if (!finalWords) return null;
  const threshold = finalWords * 0.9;
  let runningWords = 0;
  for (const event of events) {
    runningWords = Math.max(0, runningWords + addedWords(event) - removedWords(event));
    if (runningWords >= threshold) return event.at;
  }
  return null;
}

function estimateDeletionProvenance(events: WritingEvent[]) {
  let document = "";
  let provenance: Array<"typed" | "pasted"> = [];
  let deletedTypedWords = 0;
  let deletedPastedWords = 0;

  events.forEach((event) => {
    if (event.start === undefined || (!event.added && !event.removed)) return;
    const start = Math.max(0, Math.min(document.length, event.start));
    const removedLength = event.removed?.length || 0;
    if (removedLength) {
      const removedText = document.slice(start, start + removedLength) || event.removed || "";
      const removedOrigins = provenance.slice(start, start + removedLength);
      const counts = countWordsByOrigin(removedText, removedOrigins);
      deletedTypedWords += counts.typed;
      deletedPastedWords += counts.pasted;
    }
    document = document.slice(0, start) + (event.added || "") + document.slice(start + removedLength);
    const origin = event.type === "paste" ? "pasted" : "typed";
    provenance.splice(start, removedLength, ...Array.from({ length: event.added?.length || 0 }, () => origin));
  });

  const classified = deletedTypedWords + deletedPastedWords;
  const totalDeleted = events.reduce((total, event) => total + removedWords(event), 0);
  return {
    typed: deletedTypedWords + Math.max(0, totalDeleted - classified),
    pasted: deletedPastedWords
  };
}

function countWordsByOrigin(text: string, origins: Array<"typed" | "pasted">) {
  let typed = 0;
  let pasted = 0;
  for (const match of text.matchAll(/\b[\w'-]+\b/g)) {
    const origin = origins[match.index || 0] || "typed";
    if (origin === "pasted") pasted += 1;
    else typed += 1;
  }
  return { typed, pasted };
}

function addedCharacters(event: WritingEvent) {
  const explicit = (event.added || "").replace(/\s/g, "").length;
  if (explicit > 0) return explicit;
  return (event.addedWords || 0) * 5;
}

function buildMeaningfulTypingRuns(events: WritingEvent[]) {
  const typedEvents = events.filter((event) => event.type === "insert");
  const runs: Array<{ characters: number; durationMs: number }> = [];
  let currentCharacters = 0;
  let currentDurationMs = 0;
  let previousAt: number | null = null;

  typedEvents.forEach((event) => {
    const characters = addedCharacters(event);
    if (!characters) return;
    const gapMs = previousAt === null ? 0 : Math.max(0, event.at - previousAt);
    if (previousAt !== null && gapMs > MEANINGFUL_TYPING_GAP_MS) {
      if (currentCharacters >= MIN_MEANINGFUL_TYPED_CHARACTERS) {
        runs.push({ characters: currentCharacters, durationMs: Math.max(1_000, currentDurationMs) });
      }
      currentCharacters = 0;
      currentDurationMs = 0;
    }
    currentCharacters += characters;
    if (previousAt !== null) {
      currentDurationMs += Math.min(ACTIVE_GAP_MS, gapMs);
    }
    previousAt = event.at;
  });

  if (currentCharacters >= MIN_MEANINGFUL_TYPED_CHARACTERS) {
    runs.push({ characters: currentCharacters, durationMs: Math.max(1_000, currentDurationMs) });
  }

  return runs;
}

function countRevisedRegions(events: WritingEvent[], finalCharacterCount: number) {
  const starts = events
    .filter((event) => removedWords(event) > 0 && event.start !== undefined)
    .map((event) => event.start || 0);
  if (!starts.length) return 0;
  const documentScale = Math.max(finalCharacterCount, ...starts, 1);
  return new Set(starts.map((start) => Math.min(4, Math.floor((start / documentScale) * 5)))).size;
}

function isParagraphReorder(event: WritingEvent) {
  if (!event.removed || !event.added) return false;
  const removedParagraphs = paragraphs(event.removed);
  const addedParagraphs = paragraphs(event.added);
  if (removedParagraphs.length < 2 || removedParagraphs.length !== addedParagraphs.length) return false;
  if (removedParagraphs.every((paragraph, index) => paragraph === addedParagraphs[index])) return false;
  return [...removedParagraphs].sort().join("\n") === [...addedParagraphs].sort().join("\n");
}

function paragraphs(text: string) {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.toLowerCase().replace(/\s+/g, " ").trim())
    .filter((paragraph) => countWords(paragraph) >= 3);
}

function countRevisionsAfterPaste(events: WritingEvent[]) {
  let pasteSeen = false;
  let count = 0;
  events.forEach((event) => {
    if (event.type === "paste") {
      pasteSeen = true;
      return;
    }
    if (pasteSeen && removedWords(event) > 0) count += 1;
  });
  return count;
}

function splitSessions(events: WritingEvent[]) {
  if (!events.length) return [];
  const sessions: WritingEvent[][] = [[events[0]]];
  events.slice(1).forEach((event, index) => {
    const previous = events[index];
    const gap = Math.max(event.at - previous.at, event.durationSincePreviousMs || 0);
    if (gap >= SESSION_GAP_MS) sessions.push([]);
    sessions.at(-1)?.push(event);
  });
  return sessions;
}

function isMeaningfulSession(events: WritingEvent[]) {
  const changedWords = events.reduce((total, event) => total + addedWords(event) + removedWords(event), 0);
  return events.length >= 3 || changedWords >= 20;
}

function longestIdleGap(events: WritingEvent[]) {
  return events.reduce((longest, event, index) => {
    if (index === 0) return longest;
    const previous = events[index - 1];
    return Math.max(longest, event.at - previous.at, event.durationSincePreviousMs || 0);
  }, 0);
}

function isEditEvent(event: WritingEvent) {
  return event.type === "insert" || event.type === "delete" || event.type === "paste";
}

function addedWords(event: WritingEvent) {
  return event.pasteWords || event.addedWords || countWords(event.added || "");
}

function removedWords(event: WritingEvent) {
  return event.removedWords || countWords(event.removed || "");
}

function ratePerMinute(words: number, durationMs: number) {
  if (!words || !durationMs) return 0;
  return Math.round((words / (durationMs / 60_000)) * 10) / 10;
}

function ratio(value: number, total: number) {
  if (!value || !total) return 0;
  return Math.round(Math.min(1, value / total) * 1000) / 1000;
}
