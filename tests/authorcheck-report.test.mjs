import assert from "node:assert/strict";
import test from "node:test";

import { buildAuthorCheckSummary } from "../lib/authorcheck-report.ts";
import { extractProcessFeatures } from "../lib/process-features.ts";
import { extractComprehensionFeatures } from "../lib/comprehension-features.ts";
import { compareSummaryToPaper } from "../lib/summary-comparison.ts";
import { extractPlanningSourceFeatures } from "../lib/planning-source-features.ts";

function makeWords(count, prefix = "word") {
  return Array.from({ length: count }, (_, index) => `${prefix}${index}`).join(" ");
}

function build(overrides = {}) {
  const input = {
    events: [],
    submittedText: "A short submitted response.",
    summaryText: "",
    tags: [],
    behavioralRisk: {
      highCount: 0,
      mediumCount: 0,
      positiveCount: 0,
      signals: []
    },
    ...overrides
  };
  const processFeatures = overrides.processFeatures || extractProcessFeatures(input);
  const comprehensionFeatures = overrides.comprehensionFeatures || extractComprehensionFeatures({
    ...input,
    comparison: compareSummaryToPaper(input.submittedText, input.summaryText)
  });
  const planningSourceFeatures = overrides.planningSourceFeatures || extractPlanningSourceFeatures(input);
  return buildAuthorCheckSummary({
    ...input,
    processFeatures,
    comprehensionFeatures,
    planningSourceFeatures
  });
}

test("reports weak evidence as inconclusive rather than atypical", () => {
  const report = build();

  assert.equal(report.processSupportScore, 0);
  assert.equal(report.processAtypicalityScore, 0);
  assert.equal(report.assessmentLabel, "Weak Process Evidence");
  assert.match(report.assessmentDetail, /inconclusive/i);
  assert.equal(report.reasons[0].disposition, "inconclusive");
  assert.equal("flag" in report, false);
});

test("scores are sums of explicit capped dimensions", () => {
  const report = build({
    processFeatures: {
      ...extractProcessFeatures({ events: [], submittedText: makeWords(200) }),
      finalWords: 200,
      wordsAt25PercentTime: 30,
      wordsAt50PercentTime: 80,
      wordsAt75PercentTime: 140,
      largestInsertionFinalRatio: 0.2,
      activeDurationMs: 600_000,
      activeWpm: 45,
      revisionDepthScore: 20,
      meaningfulSessionCount: 5
    },
    comprehensionFeatures: {
      ...extractComprehensionFeatures({
        submittedText: makeWords(200),
        summaryText: "",
        comparison: { fallbackUsed: true, observations: [] }
      }),
      comprehensionSupportScore: 20,
      weakComprehensionScore: 15
    }
  });

  assert.deepEqual(report.supportScores, {
    compositionPlausibility: 20,
    revisionDepth: 20,
    pasteIntegration: 0,
    sessionDevelopment: 15,
    comprehensionAlignment: 20,
    sourceProcess: 0
  });
  assert.equal(report.processSupportScore, 75);
  assert.equal(report.processSupportScore, Object.values(report.supportScores).reduce((sum, value) => sum + value, 0));
  assert.equal(report.processAtypicalityScore, Object.values(report.atypicalityScores).reduce((sum, value) => sum + value, 0));
  assert.ok(report.atypicalityScores.highVelocityInsertion <= 25);
  assert.ok(report.atypicalityScores.unrevisedPasteDependence <= 30);
  assert.ok(report.atypicalityScores.minimalRevisionPattern <= 15);
  assert.ok(report.atypicalityScores.shortCompletionPattern <= 15);
  assert.ok(report.atypicalityScores.weakComprehensionSignal <= 15);
});

test("behavioral counts and duplicate tags do not change scores", () => {
  const baseline = build();
  const duplicatedEvidence = build({
    tags: Array.from({ length: 10 }, (_, index) => ({
      id: `duplicate-${index}`,
      label: "Strong summary alignment",
      category: "Comprehension",
      disposition: "supportive",
      detail: "The same observation"
    })),
    behavioralRisk: {
      highCount: 20,
      mediumCount: 20,
      positiveCount: 20,
      signals: []
    }
  });

  assert.equal(duplicatedEvidence.processSupportScore, baseline.processSupportScore);
  assert.equal(duplicatedEvidence.processAtypicalityScore, baseline.processAtypicalityScore);
});

test("confidence reflects data completeness and claim-assessment quality", () => {
  const submittedText = makeWords(180);
  const detailedEvents = Array.from({ length: 10 }, (_, index) => ({
    id: `i-${index}`,
    type: "insert",
    at: 1_000 + index * 60_000,
    start: index * 10,
    added: makeWords(18, `part${index}`),
    addedWords: 18
  }));
  const high = build({
    events: [...detailedEvents, { id: "submit", type: "submit", at: 1_000 + 11 * 60_000 }],
    submittedText,
    summaryText: makeWords(25, "summary"),
    comprehensionFeatures: {
      ...extractComprehensionFeatures({
        submittedText,
        summaryText: makeWords(25, "summary"),
        comparison: {
          fallbackUsed: false,
          observations: [{ category: "covered", basis: "claim", claim: "Central claim covered.", evidence: "claim" }]
        },
        startedAt: 1_000,
        completedAt: 121_000
      })
    }
  });
  const low = build();

  assert.equal(high.confidence, "high");
  assert.ok(high.confidenceScore >= 75);
  assert.ok(high.confidenceReasons.some((reason) => /claim-level/i.test(reason)));
  assert.equal(low.confidence, "low");
  assert.ok(low.confidenceScore < 40);
});

test("source process uses the reserved capped support dimension", () => {
  const report = build({
    planningSourceFeatures: {
      ...extractPlanningSourceFeatures({ events: [], submittedText: "" }),
      citationInsertionCount: 2,
      citationRemovalCount: 1,
      citationReplacementCount: 1,
      citationOnlyPasteCount: 1,
      prosePasteCount: 0,
      sourceRevisionAfterCitationCount: 2,
      sourceIntegrationObserved: true
    }
  });

  assert.equal(report.supportScores.sourceProcess, 5);
});

test("near-submission interaction requires all three roadmap conditions", () => {
  const pastedText = makeWords(120, "paste");
  const baseEvents = [{
    id: "paste-1",
    type: "paste",
    at: 1_000,
    added: pastedText,
    addedWords: 120,
    pasteWords: 120
  }];
  const withinTenMinutes = build({
    events: [...baseEvents, { id: "submit-1", type: "submit", at: 1_000 + 9 * 60_000 }],
    submittedText: pastedText
  });
  const afterTenMinutes = build({
    events: [...baseEvents, { id: "submit-1", type: "submit", at: 1_000 + 10 * 60_000 }],
    submittedText: pastedText
  });
  const revisedFinal = build({
    events: [...baseEvents, { id: "submit-1", type: "submit", at: 1_000 + 9 * 60_000 }],
    submittedText: `${makeWords(40, "paste")} ${makeWords(80, "replacement")}`
  });

  assert.equal(withinTenMinutes.atypicalityScores.shortCompletionPattern, 15);
  assert.equal(withinTenMinutes.atypicalityScores.minimalRevisionPattern, 15);
  assert.ok(withinTenMinutes.reasons.some((reason) => reason.id === "review-shortCompletionPattern" && /within 10 minutes/i.test(reason.detail)));
  assert.equal(afterTenMinutes.atypicalityScores.shortCompletionPattern, 0);
  assert.equal(revisedFinal.atypicalityScores.shortCompletionPattern, 0);
});

test("substantial paste rewriting adds integration support and lowers atypicality", () => {
  const pastedText = makeWords(100);
  const revisedText = `${makeWords(40)} ${makeWords(60, "replacement")}`;
  const retained = build({
    events: [{ id: "paste-1", type: "paste", at: 1_000, added: pastedText, addedWords: 100, pasteWords: 100 }],
    submittedText: pastedText
  });
  const rewritten = build({
    events: [{ id: "paste-1", type: "paste", at: 1_000, added: pastedText, addedWords: 100, pasteWords: 100 }],
    submittedText: revisedText
  });

  assert.ok(rewritten.supportScores.pasteIntegration > retained.supportScores.pasteIntegration);
  assert.ok(rewritten.processAtypicalityScore < retained.processAtypicalityScore);
  assert.equal(rewritten.sourceHighlights[0].finalContributionPercent, 40);
  assert.equal(rewritten.sourceHighlights[0].retentionPercent, 40);
});
