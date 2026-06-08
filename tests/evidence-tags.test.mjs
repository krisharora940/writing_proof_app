import assert from "node:assert/strict";
import test from "node:test";

import {
  generateBehavioralRiskEvidenceTags,
  generateComprehensionFeatureTags,
  generateObservationEvidenceTags,
  generatePlanningSourceEvidenceTags,
  generateProcessEvidenceTags,
  generateSummaryEvidenceTags,
  groupEvidenceTags
} from "../lib/evidence-tags.ts";

test("generateProcessEvidenceTags creates neutral factual paste and revision tags", () => {
  const tags = generateProcessEvidenceTags([
    {
      id: "event-1",
      type: "paste",
      at: 1000,
      added: Array.from({ length: 220 }, (_, index) => `word${index}`).join(" "),
      addedWords: 220,
      pasteWords: 220
    }
  ], Array.from({ length: 220 }, (_, index) => `word${index}`).join(" "));

  assert.ok(tags.some((tag) => tag.label === "Large paste event"));
  assert.ok(tags.some((tag) => tag.label === "Pasted text materially retained"));
  assert.ok(tags.every((tag) => !/score|suspicion|cheat/i.test(`${tag.label} ${tag.detail}`)));
});

test("generateProcessEvidenceTags detects retained paste after light rewriting", () => {
  const pasted = Array.from({ length: 100 }, (_, index) => `word${index}`).join(" ");
  const submitted = pasted
    .split(" ")
    .filter((_, index) => index >= 10)
    .concat(Array.from({ length: 10 }, (_, index) => `replacement${index}`))
    .join(" ");
  const tags = generateProcessEvidenceTags([{
    id: "event-1",
    type: "paste",
    at: 1000,
    added: pasted,
    addedWords: 100,
    pasteWords: 100
  }], submitted);

  const retained = tags.find((tag) => tag.label === "Pasted text materially retained");
  assert.ok(retained);
  assert.match(retained.detail, /90%/);
});

test("generateProcessEvidenceTags does not call substantially rewritten paste unchanged", () => {
  const pasted = Array.from({ length: 100 }, (_, index) => `word${index}`).join(" ");
  const submitted = pasted
    .split(" ")
    .filter((_, index) => index >= 40)
    .concat(Array.from({ length: 40 }, (_, index) => `replacement${index}`))
    .join(" ");
  const tags = generateProcessEvidenceTags([{
    id: "event-1",
    type: "paste",
    at: 1000,
    added: pasted,
    addedWords: 100,
    pasteWords: 100
  }], submitted);

  assert.equal(tags.some((tag) => tag.label === "Pasted text materially retained"), false);
});

test("generateBehavioralRiskEvidenceTags maps signals to neutral tags", () => {
  const tags = generateBehavioralRiskEvidenceTags([
    {
      id: "high-low-active-typing-share",
      severity: "high",
      label: "Low active typing share",
      detail: "2m of active writing was recorded across 40m of session time."
    }
  ]);
  const grouped = groupEvidenceTags(tags);

  assert.equal(tags[0].label, "Atypical: Low active typing share");
  assert.equal(tags[0].category, "Process Development");
  assert.equal(tags[0].disposition, "review");
  assert.equal(grouped["Process Development"].length, 1);
  assert.ok(tags.every((tag) => !/suspicion|cheat|misconduct/i.test(`${tag.label} ${tag.detail}`)));
});

test("generateSummaryEvidenceTags maps comparison output to grouped evidence tags", () => {
  const tags = generateSummaryEvidenceTags({
    fallbackUsed: false,
    observations: [
      { category: "covered", claim: "Main claim is reflected.", evidence: "claim" },
      { category: "missing", claim: "A major claim is absent.", evidence: "claim" }
    ]
  });
  const grouped = groupEvidenceTags(tags);

  assert.deepEqual(tags.map((tag) => tag.label), ["Strong summary alignment", "Summary omits major claim"]);
  assert.equal(grouped.Comprehension.length, 2);
  assert.deepEqual(tags.map((tag) => tag.disposition), ["supportive", "review"]);
});

test("generateComprehensionFeatureTags separates support, review, and missing evidence", () => {
  const supportive = generateComprehensionFeatureTags({
    summarySubmitted: true,
    summaryLength: 40,
    summaryLatencyMs: 120000,
    coveredClaimCount: 2,
    partialClaimCount: 1,
    majorClaimMissingCount: 0,
    claimCoverageRatio: 0.833,
    specificityScore: 75,
    genericnessScore: 10,
    overlapWithEssay: 0.5,
    independentWordingObserved: true,
    comprehensionSupportScore: 17,
    weakComprehensionScore: 1
  });
  assert.ok(supportive.some((tag) => tag.label === "Summary independently explains major claims"));

  const review = generateComprehensionFeatureTags({
    summarySubmitted: true,
    summaryLength: 20,
    summaryLatencyMs: 30000,
    coveredClaimCount: 0,
    partialClaimCount: 0,
    majorClaimMissingCount: 2,
    claimCoverageRatio: 0,
    specificityScore: 20,
    genericnessScore: 75,
    overlapWithEssay: 0.95,
    independentWordingObserved: false,
    comprehensionSupportScore: 1,
    weakComprehensionScore: 14
  });
  assert.ok(review.some((tag) => tag.label === "Summary appears generic relative to essay"));
  assert.ok(review.some((tag) => tag.label === "Summary heavily overlaps submitted text"));
  assert.ok(review.some((tag) => tag.label === "Summary omits several major claims"));

  const missing = generateComprehensionFeatureTags({
    summarySubmitted: false,
    summaryLength: 0,
    summaryLatencyMs: null,
    coveredClaimCount: 0,
    partialClaimCount: 0,
    majorClaimMissingCount: 0,
    claimCoverageRatio: 0,
    specificityScore: 0,
    genericnessScore: 0,
    overlapWithEssay: 0,
    independentWordingObserved: false,
    comprehensionSupportScore: 0,
    weakComprehensionScore: 0
  });
  assert.match(missing[0].detail, /no negative inference/i);
});

test("incomplete structured responses remain contextual rather than review evidence", () => {
  const tags = generateComprehensionFeatureTags({
    summarySubmitted: true,
    summaryLength: 18,
    summaryLatencyMs: 120000,
    responseCount: 3,
    answeredResponseCount: 2,
    responseCompletionRatio: 2 / 3,
    averageAnswerWords: 9,
    shortestAnswerWords: 7,
    comparisonFallbackUsed: true,
    claimAssessmentAvailable: false,
    coveredClaimCount: 0,
    partialClaimCount: 0,
    majorClaimMissingCount: 0,
    claimCoverageRatio: 0,
    specificityScore: 45,
    genericnessScore: 30,
    overlapWithEssay: 0.4,
    independentWordingObserved: true,
    comprehensionSupportScore: 7,
    weakComprehensionScore: 2
  });

  const incomplete = tags.find((tag) => tag.label === "Timed response set incomplete");
  assert.equal(incomplete?.disposition, "contextual");
  assert.match(incomplete?.detail || "", /no negative inference/i);
});

test("generateObservationEvidenceTags attaches tags to report observations", () => {
  const tags = generateObservationEvidenceTags([
    {
      group: "Process",
      title: "Typical process evidence",
      detail: "Writing process events were recorded."
    }
  ]);
  const grouped = groupEvidenceTags(tags);

  assert.equal(tags[0].label, "Typical process evidence");
  assert.equal(tags[0].category, "Process Development");
  assert.equal(tags[0].disposition, "contextual");
  assert.equal(grouped["Process Development"].length, 1);
});

test("generatePlanningSourceEvidenceTags reports supportive source and planning patterns", () => {
  const tags = generatePlanningSourceEvidenceTags({
    citationInsertionCount: 2,
    citationRemovalCount: 1,
    citationReplacementCount: 1,
    citationPasteCount: 1,
    citationOnlyPasteCount: 1,
    prosePasteCount: 0,
    firstCitationElapsedPercent: 25,
    sourceRevisionAfterCitationCount: 2,
    sourceIntegrationObserved: true,
    outlinePhaseDetected: true,
    outlineExpansionCount: 1,
    headingFirstDetected: true,
    headingEvolutionCount: 1,
    thesisRevisionCount: 1,
    draftExpansionPattern: true,
    promptTermUptakeRatio: 0.8,
    earlyPromptTermUptakeRatio: 0.5
  });

  assert.ok(tags.some((tag) => tag.label === "Source material developed through revision"));
  assert.ok(tags.some((tag) => tag.label === "Citation-only paste detected"));
  assert.ok(tags.some((tag) => tag.label === "Early outline formation observed"));
  assert.ok(tags.some((tag) => tag.label === "Heading structure evolved"));
  assert.ok(tags.every((tag) => ["supportive", "contextual"].includes(tag.disposition)));
});

test("fallback comparison tags remain contextual rather than claim evidence", () => {
  const tags = generateSummaryEvidenceTags({
    fallbackUsed: true,
    observations: [
      { category: "covered", basis: "keyword", claim: "Terms overlapped.", evidence: "process" },
      { category: "covered", basis: "response-quality", claim: "Length reviewed.", evidence: "20 words" }
    ]
  });

  assert.ok(tags.every((tag) => tag.category === "Comprehension"));
  assert.ok(tags.every((tag) => tag.disposition === "contextual"));
  assert.equal(tags.some((tag) => tag.label === "Strong summary alignment"), false);
});

test("groupEvidenceTags exposes the complete P3 taxonomy", () => {
  assert.deepEqual(Object.keys(groupEvidenceTags([])), [
    "Process Development",
    "Revision Depth",
    "Paste Integration",
    "Session Topology",
    "Comprehension",
    "Source Behavior",
    "Planning Behavior"
  ]);
});
