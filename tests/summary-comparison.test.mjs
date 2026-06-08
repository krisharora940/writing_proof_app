import assert from "node:assert/strict";
import test from "node:test";

import {
  compareSummaryToPaper,
  comparisonToObservations,
  validateComparison
} from "../lib/summary-comparison.ts";

test("compareSummaryToPaper returns schema-shaped neutral observations", () => {
  const comparison = compareSummaryToPaper(
    "Process evidence supports fair review because revision, drafting, and context matter.",
    "The paper says process evidence and revision help fair review."
  );

  assert.equal(comparison.fallbackUsed, true);
  assert.ok(comparison.observations.length >= 1);
  assert.ok(comparison.observations.every((item) => ["covered", "partial", "missing"].includes(item.category)));
  assert.ok(comparison.observations.every((item) => ["keyword", "response-quality"].includes(item.basis)));
  assert.doesNotMatch(JSON.stringify(comparison).toLowerCase(), /misconduct|suspicion|score/);
});

test("validateComparison removes malformed or non-neutral observations", () => {
  const comparison = validateComparison({
    fallbackUsed: false,
    observations: [
      { category: "covered", claim: "Key claims were present.", evidence: "process, review" },
      { category: "missing", claim: "Suspicious omission.", evidence: "score" },
      { category: "bad", claim: "Bad category", evidence: "ignored" },
      { category: "partial", claim: "", evidence: "ignored" }
    ]
  });

  assert.deepEqual(comparison, {
    fallbackUsed: false,
    observations: [
      { category: "covered", basis: "claim", claim: "Key claims were present.", evidence: "process, review" }
    ]
  });
});

test("fallback comparison does not label keyword or length heuristics as claims", () => {
  const comparison = compareSummaryToPaper(
    "Process evidence supports revision context and fair review.",
    "Process evidence supports fair review."
  );

  assert.equal(comparison.fallbackUsed, true);
  assert.equal(comparison.observations.some((item) => item.basis === "claim"), false);
});

test("comparisonToObservations maps validated output to report observations", () => {
  const observations = comparisonToObservations({
    fallbackUsed: true,
    observations: [
      { category: "missing", claim: "A paper term was absent.", evidence: "revision" }
    ]
  });

  assert.deepEqual(observations, [
    {
      group: "Comprehension Check",
      title: "Summary gap",
      detail: "A paper term was absent. Evidence: revision"
    }
  ]);
});
