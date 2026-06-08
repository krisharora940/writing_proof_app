import assert from "node:assert/strict";
import test from "node:test";

import { extractProcessFeatures } from "../lib/process-features.ts";

const start = Date.UTC(2026, 0, 1, 12, 0, 0);

function makeWords(count, prefix = "word") {
  return Array.from({ length: count }, (_, index) => `${prefix}${index}`).join(" ");
}

test("extractProcessFeatures builds time checkpoints from event deltas", () => {
  const features = extractProcessFeatures({
    events: [
      { id: "1", type: "insert", at: start, addedWords: 20, durationSincePreviousMs: 60_000 },
      { id: "2", type: "insert", at: start + 2 * 60_000, addedWords: 30, durationSincePreviousMs: 120_000 },
      { id: "3", type: "paste", at: start + 4 * 60_000, addedWords: 100, pasteWords: 100, durationSincePreviousMs: 120_000 },
      { id: "4", type: "delete", at: start + 5 * 60_000, removedWords: 20, deletionEvent: true, durationSincePreviousMs: 60_000 },
      { id: "5", type: "insert", at: start + 35 * 60_000, addedWords: 20, durationSincePreviousMs: 30 * 60_000 }
    ],
    submittedText: makeWords(150),
    submittedAt: start + 40 * 60_000
  });

  assert.deepEqual(features.draftBuildCurve.map((point) => point.words), [0, 130, 130, 130, 150]);
  assert.equal(features.totalDurationMs, 40 * 60_000);
  assert.equal(features.activeDurationMs, 390_000);
  assert.equal(features.overallWpm, 3.8);
  assert.equal(features.activeWpm, 23.2);
  assert.equal(features.maxRollingOneMinuteWpm, 30);
});

test("extractProcessFeatures identifies insertion timing, revisions, and sessions", () => {
  const pastedText = makeWords(100, "paste");
  const submittedText = `${pastedText} ${makeWords(50, "typed")}`;
  const features = extractProcessFeatures({
    events: [
      { id: "1", type: "insert", at: start, addedWords: 50, durationSincePreviousMs: 60_000 },
      { id: "2", type: "paste", at: start + 5 * 60_000, added: pastedText, addedWords: 100, pasteWords: 100, durationSincePreviousMs: 5 * 60_000 },
      { id: "3", type: "delete", at: start + 6 * 60_000, removedWords: 10, deletionEvent: true, durationSincePreviousMs: 60_000 },
      { id: "4", type: "insert", at: start + 40 * 60_000, addedWords: 10, durationSincePreviousMs: 34 * 60_000 }
    ],
    submittedText,
    submittedAt: start + 45 * 60_000
  });

  assert.equal(features.largestInsertionWords, 100);
  assert.equal(features.largestInsertionFinalRatio, 0.667);
  assert.equal(features.timeFromLargestInsertionToSubmitMs, 40 * 60_000);
  assert.equal(features.unrevisedPastedFinalWordsEstimate, 100);
  assert.equal(features.unrevisedPasteFinalRatio, 0.667);
  assert.equal(features.revisionAfterPasteCount, 1);
  assert.equal(features.deletedWords, 10);
  assert.equal(features.deletionToFinalRatio, 0.067);
  assert.equal(features.sessionCount, 2);
  assert.equal(features.meaningfulSessionCount, 1);
  assert.equal(features.longestIdleGapMs, 34 * 60_000);
});

test("extractProcessFeatures keeps missing process evidence neutral", () => {
  const features = extractProcessFeatures({
    events: [],
    submittedText: makeWords(25),
    submittedAt: start
  });

  assert.deepEqual(features.draftBuildCurve.map((point) => point.words), [0, 0, 0, 0, 25]);
  assert.equal(features.totalDurationMs, 0);
  assert.equal(features.overallWpm, 0);
  assert.equal(features.sessionCount, 0);
  assert.equal(features.timeFromLargestInsertionToSubmitMs, null);
});

test("extractProcessFeatures estimates retained paste after edits", () => {
  const pastedText = makeWords(100, "paste");
  const submittedText = pastedText
    .split(" ")
    .filter((_, index) => index >= 10)
    .concat(makeWords(10, "replacement").split(" "))
    .join(" ");
  const features = extractProcessFeatures({
    events: [{
      id: "paste-1",
      type: "paste",
      at: start,
      added: pastedText,
      addedWords: 100,
      pasteWords: 100
    }],
    submittedText,
    submittedAt: start + 60_000
  });

  assert.equal(features.pastedFinalWordsEstimate, 90);
  assert.equal(features.unrevisedPastedFinalWordsEstimate, 90);
  assert.equal(features.unrevisedPasteFinalRatio, 0.9);
  assert.equal(features.rewrittenPastedWordsEstimate, 10);
  assert.equal(features.localRevisionCount, 1);
  assert.ok(features.revisionDepthScore > 0);
});

test("extractProcessFeatures classifies surface, local, and structural revisions", () => {
  const features = extractProcessFeatures({
    events: [
      { id: "i-1", type: "insert", at: start, addedWords: 100 },
      { id: "r-1", type: "insert", at: start + 1000, removed: "Word", added: "word", removedWords: 1, addedWords: 1 },
      { id: "r-2", type: "insert", at: start + 2000, removed: makeWords(8, "old"), added: makeWords(10, "new"), removedWords: 8, addedWords: 10 },
      { id: "r-3", type: "delete", at: start + 3000, removed: makeWords(35, "cut"), removedWords: 35, deletionEvent: true }
    ],
    submittedText: makeWords(66),
    submittedAt: start + 4000
  });

  assert.equal(features.replacementEventCount, 2);
  assert.equal(features.surfaceRevisionCount, 1);
  assert.equal(features.localRevisionCount, 1);
  assert.equal(features.structuralRevisionCount, 1);
  assert.equal(features.sentenceLevelRevisionCount, 2);
  assert.equal(features.smallEditCount, 1);
  assert.equal(features.largeDeletionCount, 1);
  assert.equal(features.revisedWordsEstimate, 46);
  assert.equal(features.revisionDensity, 0.697);
  assert.ok(features.revisionDepthScore >= 10);
});

test("extractProcessFeatures reports burst, rolling pace, and pause structure", () => {
  const features = extractProcessFeatures({
    events: [
      { id: "i-1", type: "insert", at: start, addedWords: 30 },
      { id: "i-2", type: "insert", at: start + 15_000, addedWords: 30, durationSincePreviousMs: 15_000 },
      { id: "i-3", type: "insert", at: start + 45_000, addedWords: 30, durationSincePreviousMs: 30_000 },
      { id: "i-4", type: "insert", at: start + 3 * 60_000, addedWords: 30, durationSincePreviousMs: 135_000 }
    ],
    submittedText: makeWords(120),
    submittedAt: start + 4 * 60_000
  });

  assert.equal(features.burstWpm, 120);
  assert.equal(features.maxRollingOneMinuteWpm, 30);
  assert.equal(features.maxRollingTwoMinuteWpm, 15);
  assert.equal(features.pauseCountOver30Seconds, 2);
  assert.equal(features.pauseCountOverTwoMinutes, 1);
  assert.equal(features.medianPauseMs, 30_000);
  assert.equal(features.pauseBeforeLargestInsertionMs, 0);
  assert.equal(features.pauseAfterLargestInsertionMs, 15_000);
});

test("extractProcessFeatures estimates typed, pasted, revised, and deleted provenance", () => {
  const pasted = "alpha beta gamma delta";
  const features = extractProcessFeatures({
    events: [
      { id: "p-1", type: "paste", at: start, start: 0, added: pasted, addedWords: 4, pasteWords: 4 },
      { id: "i-1", type: "insert", at: start + 1_000, start: pasted.length, added: " typed words", addedWords: 2 },
      { id: "d-1", type: "delete", at: start + 2_000, start: 0, removed: "alpha ", removedWords: 1, deletionEvent: true },
      { id: "d-2", type: "delete", at: start + 3_000, start: "beta gamma delta ".length, removed: "typed ", removedWords: 1, deletionEvent: true }
    ],
    submittedText: "beta gamma delta words",
    submittedAt: start + 4_000
  });

  assert.equal(features.pastedFinalWordsEstimate, 3);
  assert.equal(features.typedFinalWordsEstimate, 1);
  assert.equal(features.pastedFinalRatio, 0.75);
  assert.equal(features.typedFinalRatio, 0.25);
  assert.equal(features.revisedPastedFinalWordsEstimate, 3);
  assert.equal(features.deletedPastedWordsEstimate, 1);
  assert.equal(features.deletedTypedWordsEstimate, 1);
});

test("extractProcessFeatures detects paragraph reorder and revisions across regions", () => {
  const first = "First paragraph has several useful words.";
  const second = "Second paragraph also has several useful words.";
  const features = extractProcessFeatures({
    events: [
      { id: "i-1", type: "insert", at: start, start: 0, added: makeWords(200), addedWords: 200 },
      {
        id: "r-1",
        type: "insert",
        at: start + 1_000,
        start: 0,
        removed: `${first}\n\n${second}`,
        added: `${second}\n\n${first}`,
        removedWords: 14,
        addedWords: 14
      },
      { id: "r-2", type: "insert", at: start + 2_000, start: 400, removed: "old middle words", added: "new middle words", removedWords: 3, addedWords: 3 },
      { id: "r-3", type: "insert", at: start + 3_000, start: 850, removed: "old ending words", added: "new ending words", removedWords: 3, addedWords: 3 }
    ],
    submittedText: makeWords(200),
    submittedAt: start + 4_000
  });

  assert.equal(features.paragraphReorderCount, 1);
  assert.equal(features.revisedRegionCount, 3);
  assert.ok(features.revisionDepthScore >= 10);
});

test("extractProcessFeatures detects later-session revision and immediate submission after a complete draft", () => {
  const features = extractProcessFeatures({
    events: [
      { id: "i-1", type: "insert", at: start, start: 0, addedWords: 90 },
      { id: "d-1", type: "delete", at: start + 30 * 60_000, start: 10, removed: "old", removedWords: 1, deletionEvent: true },
      { id: "i-2", type: "insert", at: start + 30 * 60_000 + 30_000, start: 10, added: "new words", addedWords: 2 },
      { id: "s-1", type: "submit", at: start + 31 * 60_000 }
    ],
    submittedText: makeWords(100)
  });

  assert.equal(features.sessionCount, 2);
  assert.equal(features.laterSessionRevisionCount, 1);
  assert.equal(features.returnedToRevise, true);
  assert.equal(features.timeFromCompleteDraftToSubmitMs, 31 * 60_000);
  assert.equal(features.immediateSubmissionAfterCompleteDraft, false);

  const immediate = extractProcessFeatures({
    events: [
      { id: "i-1", type: "insert", at: start, addedWords: 90 },
      { id: "s-1", type: "submit", at: start + 119_999 }
    ],
    submittedText: makeWords(100)
  });
  const boundary = extractProcessFeatures({
    events: [
      { id: "i-1", type: "insert", at: start, addedWords: 90 },
      { id: "s-1", type: "submit", at: start + 120_000 }
    ],
    submittedText: makeWords(100)
  });

  assert.equal(immediate.immediateSubmissionAfterCompleteDraft, true);
  assert.equal(boundary.immediateSubmissionAfterCompleteDraft, false);
});
