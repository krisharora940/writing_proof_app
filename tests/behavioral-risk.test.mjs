import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeBehavioralRisk,
  behavioralSignalsToObservations
} from "../lib/behavioral-risk.ts";

const at = Date.UTC(2026, 0, 1, 12, 0, 0);

function makeWords(count, prefix = "word") {
  return Array.from({ length: count }, (_, index) => `${prefix}${index}`).join(" ");
}

test("analyzeBehavioralRisk flags high paste share and low revision activity", () => {
  const summary = analyzeBehavioralRisk([
    {
      id: "paste-1",
      type: "paste",
      at,
      pasteWords: 80,
      addedWords: 80,
      durationSincePreviousMs: 0
    },
    {
      id: "insert-1",
      type: "insert",
      at: at + 10 * 60 * 1000,
      addedWords: 220,
      durationSincePreviousMs: 10 * 60 * 1000
    }
  ], makeWords(300));

  assert.ok(summary.signals.some((signal) => signal.id === "high-paste-ratio-paste-1" || signal.id === "medium-paste-paste-1" || signal.id === "medium-large-paste-paste-1"));
  assert.equal("totalPoints" in summary, false);
  assert.ok(!summary.signals.some((signal) => signal.id === "medium-single-day-session"));
  assert.ok(summary.signals.every((signal) => !/suspicion|cheat|misconduct/i.test(`${signal.label} ${signal.detail}`)));
});

test("analyzeBehavioralRisk detects sustained high WPM windows", () => {
  const summary = analyzeBehavioralRisk(
    Array.from({ length: 13 }, (_, index) => ({
      id: `i-${index + 1}`,
      type: "insert",
      at: at + index * 5_000,
      added: makeWords(12, `typed${index}`),
      addedWords: 12,
      durationSincePreviousMs: index === 0 ? 5_000 : 5_000
    })),
    makeWords(156)
  );

  assert.ok(summary.signals.some((signal) => signal.id === "medium-sustained-high-wpm" || signal.id === "high-sustained-very-high-wpm"));
});

test("analyzeBehavioralRisk records positive multi-session and nonlinear drafting indicators", () => {
  const summary = analyzeBehavioralRisk([
    { id: "i-1", type: "insert", at, start: 0, addedWords: 60, durationSincePreviousMs: 60_000 },
    { id: "d-1", type: "delete", at: at + 90_000, start: 400, removedWords: 4, durationSincePreviousMs: 30_000, deletionEvent: true },
    { id: "i-2", type: "insert", at: at + 120_000, start: 200, addedWords: 30, durationSincePreviousMs: 30_000 },
    { id: "i-3", type: "insert", at: at + 3 * 60 * 60 * 1000, start: 600, addedWords: 50, durationSincePreviousMs: 30_000 }
  ], makeWords(140));

  assert.ok(summary.signals.some((signal) => signal.id === "positive-multi-session-drafting"));
  assert.ok(summary.signals.some((signal) => signal.id === "positive-extended-drafting-gaps"));
  assert.ok(summary.signals.some((signal) => signal.id === "positive-pause-edit-retype"));
  assert.ok(summary.signals.some((signal) => signal.id === "positive-nonlinear-writing"));
});

test("analyzeBehavioralRisk records a later-session return to revision", () => {
  const summary = analyzeBehavioralRisk([
    { id: "i-1", type: "insert", at, start: 0, addedWords: 100 },
    { id: "d-1", type: "delete", at: at + 30 * 60_000, start: 20, removed: "old words", removedWords: 2, deletionEvent: true }
  ], makeWords(98));

  assert.ok(summary.signals.some((signal) => signal.id === "positive-returned-to-revise"));
});

test("analyzeBehavioralRisk rewards substantive revision and flags paste-heavy bursts", () => {
  const summary = analyzeBehavioralRisk([
    { id: "p-1", type: "paste", at, pasteWords: 90, addedWords: 90, durationSincePreviousMs: 0 },
    { id: "p-2", type: "paste", at: at + 30_000, pasteWords: 70, addedWords: 70, durationSincePreviousMs: 30_000 },
    { id: "d-1", type: "delete", at: at + 90_000, removedWords: 85, removed: makeWords(85), durationSincePreviousMs: 60_000, deletionEvent: true }
  ], makeWords(300));

  assert.ok(summary.signals.some((signal) => signal.id === "high-repeated-paste-share"));
  assert.ok(summary.signals.some((signal) => signal.id === "positive-structural-revision"));
});

test("analyzeBehavioralRisk does not flag missing revision without another concern", () => {
  const summary = analyzeBehavioralRisk([
    { id: "i-1", type: "insert", at, addedWords: 80, durationSincePreviousMs: 5 * 60_000 },
    { id: "i-2", type: "insert", at: at + 30 * 60_000, addedWords: 120, durationSincePreviousMs: 25 * 60_000 }
  ], makeWords(200));

  assert.equal(summary.signals.some((signal) => signal.id === "high-minimal-revision-after-large-insertion"), false);
});

test("analyzeBehavioralRisk requires large retained paste near submission for the interaction signal", () => {
  const pastedText = makeWords(180, "paste");
  const summary = analyzeBehavioralRisk([
    { id: "p-1", type: "paste", at, added: pastedText, pasteWords: 180, addedWords: 180 },
    { id: "s-1", type: "submit", at: at + 9 * 60_000 }
  ], pastedText);
  const lateSummary = analyzeBehavioralRisk([
    { id: "p-1", type: "paste", at, added: pastedText, pasteWords: 180, addedWords: 180 },
    { id: "s-1", type: "submit", at: at + 10 * 60_000 }
  ], pastedText);

  assert.ok(summary.signals.some((signal) => signal.id === "high-minimal-revision-after-large-insertion"));
  assert.equal(lateSummary.signals.some((signal) => signal.id === "high-minimal-revision-after-large-insertion"), false);
});

test("behavioralSignalsToObservations keeps factual report wording", () => {
  const summary = analyzeBehavioralRisk([
    { id: "paste-1", type: "paste", at, pasteWords: 75, addedWords: 75 }
  ], makeWords(220));
  const observations = behavioralSignalsToObservations(summary.signals);

  assert.ok(observations.length);
  assert.ok(observations.every((item) => ["Major Event", "Context Event", "Typical Process Indicator"].includes(item.group)));
  assert.ok(observations.every((item) => !/suspicion|cheat|misconduct/i.test(`${item.title} ${item.detail}`)));
});
