import assert from "node:assert/strict";
import test from "node:test";

import {
  extractPlanningSourceFeatures,
  planningSourceSupportScore
} from "../lib/planning-source-features.ts";

const start = Date.UTC(2026, 0, 1, 12, 0, 0);

function makeWords(count, prefix = "word") {
  return Array.from({ length: count }, (_, index) => `${prefix}${index}`).join(" ");
}

test("extractPlanningSourceFeatures tracks citation timing, changes, and integration", () => {
  const features = extractPlanningSourceFeatures({
    events: [
      { id: "i-1", type: "insert", at: start, start: 0, added: makeWords(20), addedWords: 20 },
      { id: "p-1", type: "paste", at: start + 2 * 60_000, start: 130, added: "\n(Smith, 2020)", addedWords: 2, pasteWords: 2 },
      {
        id: "r-1",
        type: "insert",
        at: start + 4 * 60_000,
        start: 131,
        removed: "(Smith, 2020)",
        added: "(Smith, 2021)",
        removedWords: 2,
        addedWords: 2
      },
      { id: "s-1", type: "submit", at: start + 10 * 60_000 }
    ],
    submittedText: `${makeWords(20)} (Smith, 2021)`,
    submittedAt: start + 10 * 60_000
  });

  assert.equal(features.citationInsertionCount, 2);
  assert.equal(features.citationRemovalCount, 1);
  assert.equal(features.citationReplacementCount, 1);
  assert.equal(features.citationPasteCount, 1);
  assert.equal(features.citationOnlyPasteCount, 1);
  assert.equal(features.prosePasteCount, 0);
  assert.equal(features.firstCitationElapsedPercent, 20);
  assert.equal(features.sourceRevisionAfterCitationCount, 1);
  assert.equal(features.sourceIntegrationObserved, true);
  assert.equal(planningSourceSupportScore(features), 5);
});

test("citation-only paste classification excludes ordinary sourced prose", () => {
  const features = extractPlanningSourceFeatures({
    events: [{
      id: "p-1",
      type: "paste",
      at: start,
      added: "This detailed sentence presents evidence about process review and explains why it matters for instructors (Smith, 2020).",
      addedWords: 17,
      pasteWords: 17
    }],
    submittedText: "This detailed sentence presents evidence about process review and explains why it matters for instructors (Smith, 2020)."
  });

  assert.equal(features.citationPasteCount, 1);
  assert.equal(features.citationOnlyPasteCount, 0);
  assert.equal(features.prosePasteCount, 1);
});

test("extractPlanningSourceFeatures detects outline, heading, thesis, and prompt development", () => {
  const outline = "- Introduction: process evidence\n- Evidence: revision history";
  const features = extractPlanningSourceFeatures({
    events: [
      { id: "i-1", type: "insert", at: start, start: 0, added: outline, addedWords: 7 },
      { id: "i-2", type: "insert", at: start + 60_000, start: outline.length, added: "\n- Conclusion: fair review", addedWords: 3 },
      { id: "i-3", type: "insert", at: start + 2 * 60_000, added: "\nIntroduction\n", addedWords: 1 },
      { id: "i-4", type: "insert", at: start + 3 * 60_000, added: "\nConclusion\n", addedWords: 1 },
      {
        id: "r-1",
        type: "insert",
        at: start + 4 * 60_000,
        start: 0,
        removed: "I argue that review should use final text because it is efficient and simple.",
        added: "I argue that fair academic review should use process evidence because revision history provides stronger context.",
        removedWords: 13,
        addedWords: 15
      },
      { id: "s-1", type: "submit", at: start + 20 * 60_000 }
    ],
    submittedText: `Introduction ${makeWords(60)} process evidence revision history fair academic review Conclusion`,
    promptText: "Explain whether process evidence and revision history create fairer academic review.",
    submittedAt: start + 20 * 60_000
  });

  assert.equal(features.outlinePhaseDetected, true);
  assert.equal(features.outlineExpansionCount, 1);
  assert.equal(features.headingFirstDetected, true);
  assert.ok(features.headingEvolutionCount >= 1);
  assert.equal(features.thesisRevisionCount, 1);
  assert.equal(features.draftExpansionPattern, true);
  assert.ok(features.promptTermUptakeRatio > 0.5);
  assert.ok(features.earlyPromptTermUptakeRatio > 0);
});

test("missing prompt and source evidence remain neutral", () => {
  const features = extractPlanningSourceFeatures({
    events: [],
    submittedText: "Short response"
  });

  assert.equal(features.firstCitationElapsedPercent, null);
  assert.equal(features.promptTermUptakeRatio, 0);
  assert.equal(features.earlyPromptTermUptakeRatio, 0);
  assert.equal(features.sourceIntegrationObserved, false);
  assert.equal(planningSourceSupportScore(features), 0);
});
