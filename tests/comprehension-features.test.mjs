import assert from "node:assert/strict";
import test from "node:test";

import { extractComprehensionFeatures } from "../lib/comprehension-features.ts";

const coveredComparison = {
  fallbackUsed: false,
  observations: [
    { category: "covered", claim: "Central claim covered.", evidence: "claim" },
    { category: "covered", claim: "Evidence covered.", evidence: "evidence" },
    { category: "partial", claim: "Revision partly covered.", evidence: "revision" }
  ]
};

test("extractComprehensionFeatures recognizes specific independent explanation", () => {
  const features = extractComprehensionFeatures({
    submittedText: "Process evidence records drafting changes, revision decisions, source integration, and comprehension context for fair academic review.",
    summaryText: "I argued that instructors should review how a draft developed, including revisions and source use, instead of relying only on the final prose.",
    comparison: coveredComparison,
    startedAt: 1000,
    completedAt: 121000
  });

  assert.equal(features.summarySubmitted, true);
  assert.equal(features.summaryLatencyMs, 120000);
  assert.equal(features.claimAssessmentAvailable, true);
  assert.equal(features.claimCoverageRatio, 0.833);
  assert.ok(features.specificityScore >= 60);
  assert.equal(features.independentWordingObserved, true);
  assert.ok(features.comprehensionSupportScore >= 15);
});

test("fallback heuristics do not create claim coverage or missing claims", () => {
  const features = extractComprehensionFeatures({
    submittedText: "Process evidence supports revision context and fair review.",
    summaryText: "Process evidence supports fair review.",
    comparison: {
      fallbackUsed: true,
      observations: [
        { category: "covered", basis: "keyword", claim: "Terms overlapped.", evidence: "process" },
        { category: "missing", basis: "keyword", claim: "Some terms were absent.", evidence: "revision" },
        { category: "covered", basis: "response-quality", claim: "Length reviewed.", evidence: "20 words" }
      ]
    }
  });

  assert.equal(features.claimAssessmentAvailable, false);
  assert.equal(features.coveredClaimCount, 0);
  assert.equal(features.majorClaimMissingCount, 0);
  assert.equal(features.claimCoverageRatio, 0);
  assert.ok(features.weakComprehensionScore < 7);
});

test("extractComprehensionFeatures identifies short generic response", () => {
  const features = extractComprehensionFeatures({
    submittedText: "The paper analyzes detailed writing process evidence, revision history, and source integration.",
    summaryText: "The paper is about an important topic and there are many reasons.",
    comparison: {
      fallbackUsed: false,
      observations: [
        { category: "missing", claim: "Central claim missing.", evidence: "none" },
        { category: "partial", claim: "Some context.", evidence: "paper" }
      ]
    }
  });

  assert.ok(features.genericnessScore >= 60);
  assert.ok(features.weakComprehensionScore >= 8);
  assert.equal(features.independentWordingObserved, false);
});

test("extractComprehensionFeatures detects excessive essay overlap", () => {
  const essay = "Process evidence records drafting changes revision decisions source integration and comprehension context for fair academic review across multiple sessions";
  const features = extractComprehensionFeatures({
    submittedText: essay,
    summaryText: essay,
    comparison: coveredComparison
  });

  assert.equal(features.overlapWithEssay, 1);
  assert.equal(features.independentWordingObserved, false);
  assert.ok(features.weakComprehensionScore >= 4);
});

test("extractComprehensionFeatures keeps missing response incomplete but neutral", () => {
  const features = extractComprehensionFeatures({
    submittedText: "Paper text",
    summaryText: "",
    comparison: { fallbackUsed: true, observations: [] }
  });

  assert.equal(features.summarySubmitted, false);
  assert.equal(features.comprehensionSupportScore, 0);
  assert.equal(features.weakComprehensionScore, 0);
  assert.equal(features.summaryLatencyMs, null);
});

test("structured responses report completeness without counting prompt text", () => {
  const features = extractComprehensionFeatures({
    submittedText: "The essay argues for process evidence and explains revision context.",
    summaryText: "I argued that revision context makes process evidence fairer.",
    responses: [
      {
        question: "Repeat this very long prompt about unrelated astronomy vocabulary and orbital mechanics.",
        answer: "I argued that revision context makes process evidence fairer."
      },
      {
        question: "What evidence did you use?",
        answer: ""
      }
    ],
    comparison: { fallbackUsed: true, observations: [] }
  });

  assert.equal(features.summaryLength, 9);
  assert.equal(features.responseCount, 2);
  assert.equal(features.answeredResponseCount, 1);
  assert.equal(features.responseCompletionRatio, 0.5);
  assert.equal(features.averageAnswerWords, 9);
});
