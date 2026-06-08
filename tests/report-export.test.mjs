import assert from "node:assert/strict";
import test from "node:test";

import { createReportExport, normalizeReportExportFormat } from "../lib/report-export.ts";

const report = {
  observations: [{
    group: "Comprehension Check",
    title: "Summary coverage",
    detail: "The timed summary mentions process evidence."
  }],
  tags: [],
  behavioralRisk: {
    highCount: 0,
    mediumCount: 0,
    positiveCount: 0,
    signals: []
  },
  authorCheck: {
    processSupportScore: 72,
    processAtypicalityScore: 12,
    supportScores: {
      compositionPlausibility: 20,
      revisionDepth: 18,
      pasteIntegration: 0,
      sessionDevelopment: 14,
      comprehensionAlignment: 20,
      sourceProcess: 0
    },
    atypicalityScores: {
      highVelocityInsertion: 5,
      unrevisedPasteDependence: 0,
      minimalRevisionPattern: 0,
      shortCompletionPattern: 0,
      weakComprehensionSignal: 7
    },
    confidence: "high",
    confidenceScore: 88,
    confidenceReasons: ["Final submitted text is available.", "The event history is complete."],
    assessmentLabel: "Strong Process Evidence",
    assessmentDetail: "The recorded process contains substantial supportive evidence.",
    reasons: [{
      id: "support-compositionPlausibility",
      disposition: "supportive",
      label: "Gradual composition pattern",
      detail: "20 of 20 support points were assigned to this dimension."
    }, {
      id: "review-highVelocityInsertion",
      disposition: "review",
      label: "High-velocity insertion",
      detail: "5 of 25 atypicality points were assigned to this dimension."
    }],
    writingPatternChecks: [],
    styleConsistencyChecks: [],
    sourceHighlights: []
  },
  processFeatures: {
    finalWords: 5,
    totalDurationMs: 600000,
    activeDurationMs: 240000,
    overallWpm: 0.5,
    activeWpm: 1.25,
    maxRollingOneMinuteWpm: 3,
    wordsAt25PercentTime: 1,
    wordsAt50PercentTime: 2,
    wordsAt75PercentTime: 4,
    pasteEventCount: 0,
    pastedWords: 0,
    pastedFinalWordsEstimate: 0,
    unrevisedPastedFinalWordsEstimate: 0,
    unrevisedPasteFinalRatio: 0,
    rewrittenPastedWordsEstimate: 0,
    deletionEventCount: 1,
    deletedWords: 1,
    deletionToFinalRatio: 0.2,
    replacementEventCount: 1,
    surfaceRevisionCount: 1,
    localRevisionCount: 0,
    structuralRevisionCount: 0,
    sentenceLevelRevisionCount: 0,
    smallEditCount: 1,
    largeDeletionCount: 0,
    revisedWordsEstimate: 1,
    revisionAfterPasteCount: 0,
    revisionDensity: 0.2,
    revisionDepthScore: 2,
    sessionCount: 1,
    meaningfulSessionCount: 1,
    longestIdleGapMs: 120000,
    largestInsertionWords: 2,
    largestInsertionFinalRatio: 0.4,
    timeFromLargestInsertionToSubmitMs: 180000,
    draftBuildCurve: [
      { elapsedPercent: 0, at: 0, words: 0 },
      { elapsedPercent: 25, at: 150000, words: 1 },
      { elapsedPercent: 50, at: 300000, words: 2 },
      { elapsedPercent: 75, at: 450000, words: 4 },
      { elapsedPercent: 100, at: 600000, words: 5 }
    ]
  },
  comprehensionFeatures: {
    summarySubmitted: true,
    summaryLength: 6,
    summaryLatencyMs: 120000,
    responseCount: 2,
    answeredResponseCount: 2,
    responseCompletionRatio: 1,
    averageAnswerWords: 12,
    shortestAnswerWords: 10,
    comparisonFallbackUsed: false,
    claimAssessmentAvailable: true,
    coveredClaimCount: 2,
    partialClaimCount: 0,
    majorClaimMissingCount: 0,
    claimCoverageRatio: 1,
    specificityScore: 72,
    genericnessScore: 16,
    overlapWithEssay: 0.5,
    independentWordingObserved: true,
    comprehensionSupportScore: 19,
    weakComprehensionScore: 1
  },
  planningSourceFeatures: {
    citationInsertionCount: 2,
    citationRemovalCount: 1,
    citationReplacementCount: 1,
    citationPasteCount: 1,
    citationOnlyPasteCount: 1,
    prosePasteCount: 0,
    firstCitationElapsedPercent: 30,
    sourceRevisionAfterCitationCount: 2,
    sourceIntegrationObserved: true,
    outlinePhaseDetected: true,
    outlineExpansionCount: 1,
    headingFirstDetected: true,
    headingEvolutionCount: 1,
    thesisRevisionCount: 1,
    draftExpansionPattern: true,
    promptTermUptakeRatio: 0.75,
    earlyPromptTermUptakeRatio: 0.5
  },
  pasteEventCards: [{
    id: "paste-card-1",
    eventId: "event-1",
    at: 1000,
    title: "Paste event",
    detail: "12 words were inserted through paste input.",
    wordCount: 12,
    characterCount: 72,
    textPreview: "Pasted text preview",
    tagIds: [],
    replayFrameIndex: 1
  }],
  timelineMarkers: [{
    id: "timeline-paste-1",
    eventId: "event-1",
    at: 1000,
    kind: "paste-event",
    label: "Paste input",
    detail: "12 words were inserted through paste input.",
    tagIds: [],
    replayFrameIndex: 1
  }],
  frames: [],
  submittedText: "Process evidence supports fair review.",
  summaryText: "The summary mentions process evidence.",
  comprehensionResponses: [
    { question: "What was the central claim?", answer: "Process evidence supports fair review." },
    { question: "What evidence did you use?", answer: "Drafting and revision history." }
  ]
};

test("normalizeReportExportFormat defaults to html", () => {
  assert.equal(normalizeReportExportFormat(null), "html");
  assert.equal(normalizeReportExportFormat("bad"), "html");
  assert.equal(normalizeReportExportFormat("csv"), "csv");
  assert.equal(normalizeReportExportFormat("pdf"), "pdf");
});

test("createReportExport creates html, csv, and pdf payloads", () => {
  const html = createReportExport(report, "html", "session-1");
  assert.equal(html.contentType, "text/html; charset=utf-8");
  assert.match(String(html.body), /Neutral Evidence Report/);
  assert.match(String(html.body), /Process Support: 72%/);
  assert.match(String(html.body), /Process Atypicality: 12%/);
  assert.match(String(html.body), /Composition Plausibility: 20\/20/);
  assert.match(String(html.body), /Assessment Reasons/);
  assert.match(String(html.body), /High-velocity insertion/);
  assert.doesNotMatch(String(html.body), /risk points/i);
  assert.match(String(html.body), /Draft Build Curve/);
  assert.match(String(html.body), /Largest insertion: 2 words/);
  assert.match(String(html.body), /Pace:/);
  assert.match(String(html.body), /Pauses:/);
  assert.match(String(html.body), /Final contribution estimate:/);
  assert.match(String(html.body), /Contribution estimate methodology:/);
  assert.match(String(html.body), /Retained paste estimate: 0 words/);
  assert.match(String(html.body), /Revision Depth/);
  assert.match(String(html.body), /Depth score: 2\/20/);
  assert.match(String(html.body), /Comprehension Alignment/);
  assert.match(String(html.body), /Source and Planning Process/);
  assert.match(String(html.body), /Citations: 2 additions/);
  assert.match(String(html.body), /Claim coverage: 100%/);
  assert.match(String(html.body), /2 of 2 prompts answered/);
  assert.match(String(html.body), /What was the central claim/);
  assert.match(String(html.body), /Paste Event Cards/);
  assert.match(String(html.body), /Timeline Markers/);
  assert.equal(html.filename, "writing-report-session-1.html");

  const csv = createReportExport(report, "csv", "session-1");
  assert.equal(csv.contentType, "text/csv; charset=utf-8");
  assert.match(String(csv.body), /"section","group","title","detail"/);
  assert.match(String(csv.body), /"paste_card"/);
  assert.match(String(csv.body), /"timeline_marker"/);
  assert.match(String(csv.body), /"process_score","support","72%"/);
  assert.match(String(csv.body), /"support_dimension","Composition Plausibility","20\/20"/);
  assert.match(String(csv.body), /"assessment_reason","supportive","Gradual composition pattern"/);
  assert.match(String(csv.body), /"assessment_reason","review","High-velocity insertion"/);
  assert.doesNotMatch(String(csv.body), /risk_points/i);
  assert.match(String(csv.body), /"draft_build","largest insertion","2 words"/);
  assert.match(String(csv.body), /"writing_pace","burst and rolling"/);
  assert.match(String(csv.body), /"pause_structure","pause counts"/);
  assert.match(String(csv.body), /"final_contribution","typed and pasted"/);
  assert.match(String(csv.body), /"final_contribution","methodology"/);
  assert.match(String(csv.body), /"paste_retention","retained paste estimate","0 words"/);
  assert.match(String(csv.body), /"revision_depth","depth score","2\/20"/);
  assert.match(String(csv.body), /"comprehension","claim coverage","100%"/);
  assert.match(String(csv.body), /"comprehension_response","prompt 1","What was the central claim\?"/);
  assert.match(String(csv.body), /"source_process","citation changes","2 additions"/);
  assert.match(String(csv.body), /"planning_process","prompt uptake","75% final"/);

  const pdf = createReportExport(report, "pdf", "session-1");
  assert.equal(pdf.contentType, "application/pdf");
  assert.ok(pdf.body instanceof Uint8Array);
  const decodedPdf = new TextDecoder().decode(pdf.body);
  assert.equal(decodedPdf.startsWith("%PDF-1.4"), true);
  assert.match(decodedPdf, /Score Dimension Breakdown/);
  assert.match(decodedPdf, /Contribution estimate methodology/);
  assert.match(decodedPdf, /\/Count ([2-9]|\d{2,})/);

  const longPdf = createReportExport({
    ...report,
    submittedText: `${"extended submission text ".repeat(258)}FINAL_EXPORT_MARKER`,
    summaryText: "Résumé complete."
  }, "pdf", "session-long");
  const decodedLongPdf = new TextDecoder().decode(longPdf.body);
  assert.match(decodedLongPdf, /FINAL_EXPORT_MARKER/);
  assert.match(decodedLongPdf, /Re\?sume\? complete\./);
});
