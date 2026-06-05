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

  assert.ok(summary.totalPoints > 0);
  assert.ok(summary.signals.some((signal) => signal.id === "high-paste-ratio-paste-1" || signal.id === "medium-paste-paste-1" || signal.id === "medium-large-paste-paste-1"));
  assert.ok(summary.signals.some((signal) => signal.id === "high-low-word-deletion-rate"));
  assert.ok(!summary.signals.some((signal) => signal.id === "medium-single-day-session"));
  assert.ok(summary.signals.every((signal) => !/suspicion|cheat|misconduct/i.test(`${signal.label} ${signal.detail}`)));
});

test("analyzeBehavioralRisk detects sustained high WPM windows", () => {
  const summary = analyzeBehavioralRisk([
    { id: "i-1", type: "insert", at, addedWords: 80, durationSincePreviousMs: 30_000 },
    { id: "i-2", type: "insert", at: at + 30_000, addedWords: 80, durationSincePreviousMs: 30_000 },
    { id: "i-3", type: "insert", at: at + 60_000, addedWords: 80, durationSincePreviousMs: 30_000 }
  ], makeWords(240));

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

test("analyzeBehavioralRisk rewards substantive revision and flags paste-heavy bursts", () => {
  const summary = analyzeBehavioralRisk([
    { id: "p-1", type: "paste", at, pasteWords: 90, addedWords: 90, durationSincePreviousMs: 0 },
    { id: "p-2", type: "paste", at: at + 30_000, pasteWords: 70, addedWords: 70, durationSincePreviousMs: 30_000 },
    { id: "d-1", type: "delete", at: at + 90_000, removedWords: 85, removed: makeWords(85), durationSincePreviousMs: 60_000, deletionEvent: true }
  ], makeWords(300));

  assert.ok(summary.signals.some((signal) => signal.id === "high-repeated-paste-share"));
  assert.ok(summary.signals.some((signal) => signal.id === "positive-large-deletion-d-1"));
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
