import assert from "node:assert/strict";
import test from "node:test";

import {
  activeWritingMs,
  analyzeComprehension,
  analyzeProcess,
  countWords,
  formatDuration,
  getDiff
} from "../lib/writing-events.ts";

const at = Date.UTC(2026, 0, 1, 12, 0, 0);

function makeWords(count, prefix = "word") {
  return Array.from({ length: count }, (_, index) => `${prefix}${index}`).join(" ");
}

test("getDiff identifies insertions, deletions, and replacements", () => {
  assert.deepEqual(getDiff("hello world", "hello brave world"), {
    start: 6,
    removed: "",
    added: "brave "
  });

  assert.deepEqual(getDiff("hello brave world", "hello world"), {
    start: 6,
    removed: "brave ",
    added: ""
  });

  assert.deepEqual(getDiff("process evidence", "process audit"), {
    start: 8,
    removed: "evidence",
    added: "audit"
  });
});

test("countWords handles punctuation, apostrophes, and empty text", () => {
  assert.equal(countWords(""), 0);
  assert.equal(countWords("Drafting isn't copy-paste; it is revision."), 6);
});

test("formatDuration rounds milliseconds and uses minute labels", () => {
  assert.equal(formatDuration(-1000), "0s");
  assert.equal(formatDuration(1499), "1s");
  assert.equal(formatDuration(61_000), "1m 1s");
});

test("activeWritingMs includes writing events, caps idle gaps, and ignores submit", () => {
  const events = [
    { id: "1", type: "insert", at, durationSincePreviousMs: 10_000 },
    { id: "2", type: "paste", at: at + 1, durationSincePreviousMs: 60_000 },
    { id: "3", type: "submit", at: at + 2, words: 120 }
  ];

  assert.equal(activeWritingMs(events), 40_000);
});

test("analyzeProcess flags large paste events and low active writing time", () => {
  const events = [
    {
      id: "1",
      type: "paste",
      at,
      durationSincePreviousMs: 0,
      pasteWords: 220,
      addedWords: 220
    }
  ];

  const observations = analyzeProcess(events, makeWords(220));

  assert.equal(observations[0].group, "Major Event");
  assert.equal(observations[0].title, "Large insertion");
  assert.ok(observations.some((item) => item.title === "Low active writing time"));
  assert.ok(observations.some((item) => item.title === "No revision activity"));
});

test("analyzeProcess records deletion and idle-gap context events", () => {
  const events = [
    {
      id: "1",
      type: "delete",
      at,
      removed: "old sentence",
      removedCharacters: 12,
      removedWords: 2,
      durationSincePreviousMs: 5_000,
      deletionEvent: true
    },
    {
      id: "2",
      type: "insert",
      at: at + 25 * 60 * 1000,
      addedWords: 80,
      durationSincePreviousMs: 25 * 60 * 1000
    }
  ];

  const observations = analyzeProcess(events, makeWords(120));

  assert.ok(observations.some((item) => item.title === "Deletion event"));
  assert.ok(observations.some((item) => item.title === "Idle gap followed by insertion"));
});

test("analyzeProcess returns a neutral typical-process observation when no flags apply", () => {
  const observations = analyzeProcess(
    [{ id: "1", type: "insert", at, addedWords: 8, durationSincePreviousMs: 8_000 }],
    makeWords(20)
  );

  assert.deepEqual(observations, [
    {
      group: "Typical Process Indicator",
      title: "Variable drafting activity",
      detail: "The event log contains smaller writing actions across the drafting session."
    }
  ]);
});

test("analyzeComprehension reports keyword overlap without suspicion language", () => {
  const observation = analyzeComprehension(
    "Process evidence supports fair review. Process evidence shows revision and drafting.",
    "The summary discusses process evidence and fair review."
  );

  assert.equal(observation.group, "Comprehension Check");
  assert.equal(observation.title, "Summary-to-paper keyword overlap");
  assert.match(observation.detail, /key paper terms appeared/);
  assert.doesNotMatch(observation.detail.toLowerCase(), /suspicion|misconduct|score/);
});
