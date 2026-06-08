import type { ProfessorReportResponse } from "./server-boundaries";

export type ReportExportFormat = "html" | "csv" | "pdf";

export type ReportExport = {
  body: string | Uint8Array;
  contentType: string;
  filename: string;
};

export function normalizeReportExportFormat(value: string | null): ReportExportFormat {
  if (value === "csv" || value === "pdf") return value;
  return "html";
}

export function createReportExport(report: ProfessorReportResponse, format: ReportExportFormat, sessionId: string): ReportExport {
  if (format === "csv") {
    return {
      body: createCsv(report),
      contentType: "text/csv; charset=utf-8",
      filename: `writing-report-${sessionId}.csv`
    };
  }

  if (format === "pdf") {
    return {
      body: createPdf(report),
      contentType: "application/pdf",
      filename: `writing-report-${sessionId}.pdf`
    };
  }

  return {
    body: createHtml(report),
    contentType: "text/html; charset=utf-8",
    filename: `writing-report-${sessionId}.html`
  };
}

function createCsv(report: ProfessorReportResponse) {
  const tags = report.tags || [];
  const pasteCards = report.pasteEventCards || [];
  const markers = report.timelineMarkers || [];
  const rows = [
    ["section", "group", "title", "detail"],
    ["process_assessment", report.authorCheck?.assessmentLabel ?? "Weak Process Evidence", `Confidence: ${report.authorCheck?.confidence ?? "low"} (${report.authorCheck?.confidenceScore ?? 0}% data quality)`, report.authorCheck?.assessmentDetail ?? ""],
    ...(report.authorCheck?.confidenceReasons || []).map((reason) => ["confidence_reason", report.authorCheck?.confidence ?? "low", reason, ""]),
    ["process_score", "support", `${report.authorCheck?.processSupportScore ?? 0}%`, "Evidence of meaningful drafting, revision, and comprehension."],
    ["process_score", "atypicality", `${report.authorCheck?.processAtypicalityScore ?? 0}%`, "Process indicators that may warrant contextual review."],
    ...scoreRows("support_dimension", report.authorCheck?.supportScores, supportDimensionMaxima),
    ...scoreRows("atypicality_dimension", report.authorCheck?.atypicalityScores, atypicalityDimensionMaxima),
    ...(report.authorCheck?.reasons || []).map((reason) => ["assessment_reason", reason.disposition, reason.label, reason.detail]),
    ["draft_build", "25% elapsed", `${report.processFeatures?.wordsAt25PercentTime ?? 0} words`, ""],
    ["draft_build", "50% elapsed", `${report.processFeatures?.wordsAt50PercentTime ?? 0} words`, ""],
    ["draft_build", "75% elapsed", `${report.processFeatures?.wordsAt75PercentTime ?? 0} words`, ""],
    ["draft_build", "largest insertion", `${report.processFeatures?.largestInsertionWords ?? 0} words`, `${Math.round((report.processFeatures?.largestInsertionFinalRatio ?? 0) * 100)}% of final submission`],
    ["draft_build", "completion to submission", formatExportDuration(report.processFeatures?.timeFromCompleteDraftToSubmitMs), report.processFeatures?.immediateSubmissionAfterCompleteDraft ? "Immediate submission pattern observed" : "Immediate submission pattern not observed"],
    ["writing_pace", "burst and rolling", `${report.processFeatures?.burstWpm ?? 0} burst WPM`, `${report.processFeatures?.maxRollingOneMinuteWpm ?? 0} one-minute; ${report.processFeatures?.maxRollingTwoMinuteWpm ?? 0} two-minute WPM`],
    ["pause_structure", "pause counts", `${report.processFeatures?.pauseCountOver30Seconds ?? 0} over 30s`, `${report.processFeatures?.pauseCountOverTwoMinutes ?? 0} over 2m; median ${formatExportDuration(report.processFeatures?.medianPauseMs)}`],
    ["pause_structure", "largest insertion context", formatExportDuration(report.processFeatures?.pauseBeforeLargestInsertionMs), `before insertion; ${formatExportDuration(report.processFeatures?.pauseAfterLargestInsertionMs)} after insertion`],
    ["paste_retention", "retained paste estimate", `${report.processFeatures?.pastedFinalWordsEstimate ?? 0} words`, `${Math.round((report.processFeatures?.unrevisedPasteFinalRatio ?? 0) * 100)}% of final remained materially unchanged`],
    ["final_contribution", "typed and pasted", `${report.processFeatures?.typedFinalWordsEstimate ?? 0} typed words`, `${report.processFeatures?.pastedFinalWordsEstimate ?? 0} pasted words represented in final`],
    ["final_contribution", "revised and deleted", `${report.processFeatures?.revisedPastedFinalWordsEstimate ?? 0} revised pasted words`, `${report.processFeatures?.deletedTypedWordsEstimate ?? 0} deleted typed; ${report.processFeatures?.deletedPastedWordsEstimate ?? 0} deleted pasted`],
    ["final_contribution", "methodology", "Event-offset and text-overlap estimates", "Typed and pasted estimates partition final words; revised and unrevised estimates partition retained pasted words; deleted estimates preserve recorded origin."],
    ["revision_depth", "depth score", `${report.processFeatures?.revisionDepthScore ?? 0}/20`, `${report.processFeatures?.revisedWordsEstimate ?? 0} revised words estimated`],
    ["revision_depth", "revision types", `${report.processFeatures?.surfaceRevisionCount ?? 0} surface; ${report.processFeatures?.localRevisionCount ?? 0} local; ${report.processFeatures?.structuralRevisionCount ?? 0} structural`, `${report.processFeatures?.replacementEventCount ?? 0} replacement events`],
    ["revision_depth", "revision topology", `${report.processFeatures?.revisedRegionCount ?? 0} document regions`, `${report.processFeatures?.paragraphReorderCount ?? 0} paragraph reorders; ${report.processFeatures?.laterSessionRevisionCount ?? 0} later-session revisions`],
    ["source_process", "citation changes", `${report.planningSourceFeatures?.citationInsertionCount ?? 0} additions`, `${report.planningSourceFeatures?.citationRemovalCount ?? 0} removals; ${report.planningSourceFeatures?.citationReplacementCount ?? 0} replacements`],
    ["source_process", "paste classification", `${report.planningSourceFeatures?.citationOnlyPasteCount ?? 0} citation-only`, `${report.planningSourceFeatures?.citationPasteCount ?? 0} containing citations; ${report.planningSourceFeatures?.prosePasteCount ?? 0} prose paste events`],
    ["source_process", "integration", report.planningSourceFeatures?.sourceIntegrationObserved ? "observed" : "not established", `${report.planningSourceFeatures?.sourceRevisionAfterCitationCount ?? 0} revisions followed citation insertion`],
    ["planning_process", "outline and headings", report.planningSourceFeatures?.outlinePhaseDetected ? "early outline observed" : "early outline not observed", `${report.planningSourceFeatures?.outlineExpansionCount ?? 0} outline expansions; heading-first ${report.planningSourceFeatures?.headingFirstDetected ? "observed" : "not observed"}; ${report.planningSourceFeatures?.headingEvolutionCount ?? 0} heading changes`],
    ["planning_process", "thesis and expansion", `${report.planningSourceFeatures?.thesisRevisionCount ?? 0} thesis revisions`, report.planningSourceFeatures?.draftExpansionPattern ? "outline-to-draft expansion observed" : "outline-to-draft expansion not observed"],
    ["planning_process", "prompt uptake", `${Math.round((report.planningSourceFeatures?.promptTermUptakeRatio ?? 0) * 100)}% final`, `${Math.round((report.planningSourceFeatures?.earlyPromptTermUptakeRatio ?? 0) * 100)}% early`],
    ["comprehension", "claim coverage", report.comprehensionFeatures?.claimAssessmentAvailable ? `${Math.round((report.comprehensionFeatures?.claimCoverageRatio ?? 0) * 100)}%` : "not assessed", `${report.comprehensionFeatures?.majorClaimMissingCount ?? 0} missing claim observations`],
    ["comprehension", "response quality", `${report.comprehensionFeatures?.specificityScore ?? 0}% specificity`, `${report.comprehensionFeatures?.genericnessScore ?? 0}% genericness; ${Math.round((report.comprehensionFeatures?.overlapWithEssay ?? 0) * 100)}% essay overlap`],
    ["comprehension", "response completeness", `${report.comprehensionFeatures?.answeredResponseCount ?? 0}/${report.comprehensionFeatures?.responseCount ?? 0} prompts answered`, `${report.comprehensionFeatures?.averageAnswerWords ?? 0} average words per answered prompt`],
    ...(report.comprehensionResponses || []).map((item, index) => ["comprehension_response", `prompt ${index + 1}`, item.question, item.answer || "No response recorded."]),
    ["behavioral_summary", "indicator_counts", `${report.behavioralRisk?.highCount ?? 0} review; ${report.behavioralRisk?.mediumCount ?? 0} contextual; ${report.behavioralRisk?.positiveCount ?? 0} supportive`, "Behavioral indicators are explanatory evidence and are not independently summed into a risk score."],
    ...tags.map((item) => ["tag", `${item.category} · ${item.disposition}`, item.label, item.detail]),
    ...pasteCards.map((item) => ["paste_card", `${item.wordCount} words`, item.title, item.detail]),
    ...markers.map((item) => ["timeline_marker", item.kind, item.label, item.detail]),
    ...report.observations.map((item) => ["observation", item.group, item.title, item.detail]),
    ["submitted_text", "", "", report.submittedText],
    ["timed_summary", "", "", report.summaryText]
  ];

  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function createHtml(report: ProfessorReportResponse) {
  const tags = (report.tags || []).map((item) => (
    `<article><p>${escapeHtml(item.category)} · ${escapeHtml(item.disposition)}</p><h2>${escapeHtml(item.label)}</h2><p>${escapeHtml(item.detail)}</p></article>`
  )).join("");
  const pasteCards = (report.pasteEventCards || []).map((item) => (
    `<article><p>Paste Card</p><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.detail)}</p><pre>${escapeHtml(item.textPreview)}</pre></article>`
  )).join("");
  const markers = (report.timelineMarkers || []).map((item) => (
    `<article><p>${escapeHtml(item.kind)}</p><h2>${escapeHtml(item.label)}</h2><p>${escapeHtml(item.detail)}</p></article>`
  )).join("");
  const observations = report.observations.map((item) => (
    `<article><p>${escapeHtml(item.group)}</p><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.detail)}</p></article>`
  )).join("");

  return [
    "<!doctype html>",
    "<html><head><meta charset=\"utf-8\"><title>Neutral Evidence Report</title>",
    "<style>body{font-family:Arial,sans-serif;line-height:1.5;max-width:920px;margin:40px auto;padding:0 24px;color:#17202a}article{border-top:1px solid #ccd5df;padding:16px 0}p:first-child{font-size:12px;text-transform:uppercase;color:#56616f}pre{white-space:pre-wrap;background:#f6f8fa;padding:16px;border-radius:6px}</style>",
    "</head><body><h1>Neutral Evidence Report</h1>",
    "<h2>DraftProof System</h2>",
    `<p><strong>${escapeHtml(report.authorCheck?.assessmentLabel ?? "Weak Process Evidence")}</strong> · ${escapeHtml(report.authorCheck?.confidence ?? "low")} confidence (${report.authorCheck?.confidenceScore ?? 0}% data quality). ${escapeHtml(report.authorCheck?.assessmentDetail ?? "")}</p>`,
    `<p>${escapeHtml((report.authorCheck?.confidenceReasons || []).join(" "))}</p>`,
    `<p>Process Support: ${escapeHtml(String(report.authorCheck?.processSupportScore ?? 0))}% · Process Atypicality: ${escapeHtml(String(report.authorCheck?.processAtypicalityScore ?? 0))}%</p>`,
    scoreBreakdownHtml(report),
    reasonsHtml(report),
    "<h2>Draft Build Curve</h2>",
    `<p>25%: ${report.processFeatures?.wordsAt25PercentTime ?? 0} words · 50%: ${report.processFeatures?.wordsAt50PercentTime ?? 0} words · 75%: ${report.processFeatures?.wordsAt75PercentTime ?? 0} words · Final: ${report.processFeatures?.finalWords ?? 0} words.</p>`,
    `<p>Largest insertion: ${report.processFeatures?.largestInsertionWords ?? 0} words (${Math.round((report.processFeatures?.largestInsertionFinalRatio ?? 0) * 100)}% of final). Time from largest insertion to submission: ${formatExportDuration(report.processFeatures?.timeFromLargestInsertionToSubmitMs)}.</p>`,
    `<p>Time from 90% draft completion to submission: ${formatExportDuration(report.processFeatures?.timeFromCompleteDraftToSubmitMs)}. Immediate submission pattern: ${report.processFeatures?.immediateSubmissionAfterCompleteDraft ? "observed" : "not observed"}.</p>`,
    `<p>Pace: ${report.processFeatures?.burstWpm ?? 0} burst WPM, ${report.processFeatures?.maxRollingOneMinuteWpm ?? 0} one-minute WPM, and ${report.processFeatures?.maxRollingTwoMinuteWpm ?? 0} two-minute WPM.</p>`,
    `<p>Pauses: ${report.processFeatures?.pauseCountOver30Seconds ?? 0} over 30 seconds, ${report.processFeatures?.pauseCountOverTwoMinutes ?? 0} over 2 minutes; median ${formatExportDuration(report.processFeatures?.medianPauseMs)}.</p>`,
    `<p>Retained paste estimate: ${report.processFeatures?.pastedFinalWordsEstimate ?? 0} words. Materially unchanged paste estimate: ${report.processFeatures?.unrevisedPastedFinalWordsEstimate ?? 0} words.</p>`,
    `<p>Final contribution estimate: ${report.processFeatures?.typedFinalWordsEstimate ?? 0} typed words and ${report.processFeatures?.pastedFinalWordsEstimate ?? 0} pasted words. ${report.processFeatures?.revisedPastedFinalWordsEstimate ?? 0} pasted words were substantially revised.</p>`,
    `<p>Deletion provenance estimate: ${report.processFeatures?.deletedTypedWordsEstimate ?? 0} typed words and ${report.processFeatures?.deletedPastedWordsEstimate ?? 0} pasted words were deleted.</p>`,
    "<p><strong>Contribution estimate methodology:</strong> Estimates use recorded event offsets and text overlap. Typed and pasted estimates partition final words; revised and unrevised estimates partition retained pasted words. Deleted estimates identify the recorded origin of removed words.</p>",
    "<h2>Revision Depth</h2>",
    `<p>Depth score: ${report.processFeatures?.revisionDepthScore ?? 0}/20. Estimated revised words: ${report.processFeatures?.revisedWordsEstimate ?? 0}. Revision density: ${Math.round((report.processFeatures?.revisionDensity ?? 0) * 100)}%.</p>`,
    `<p>${report.processFeatures?.surfaceRevisionCount ?? 0} surface, ${report.processFeatures?.localRevisionCount ?? 0} local, and ${report.processFeatures?.structuralRevisionCount ?? 0} structural revision events were identified.</p>`,
    `<p>${report.processFeatures?.revisedRegionCount ?? 0} document regions were revised; ${report.processFeatures?.paragraphReorderCount ?? 0} paragraph reorder patterns and ${report.processFeatures?.laterSessionRevisionCount ?? 0} later-session revision sessions were estimated.</p>`,
    "<h2>Source and Planning Process</h2>",
    `<p>Citations: ${report.planningSourceFeatures?.citationInsertionCount ?? 0} additions, ${report.planningSourceFeatures?.citationRemovalCount ?? 0} removals, and ${report.planningSourceFeatures?.citationReplacementCount ?? 0} replacements. First citation timing: ${report.planningSourceFeatures?.firstCitationElapsedPercent ?? "not observed"}${report.planningSourceFeatures?.firstCitationElapsedPercent === null || report.planningSourceFeatures?.firstCitationElapsedPercent === undefined ? "" : "% elapsed"}.</p>`,
    `<p>Paste classification: ${report.planningSourceFeatures?.citationOnlyPasteCount ?? 0} citation-only and ${report.planningSourceFeatures?.prosePasteCount ?? 0} prose paste events. Source integration: ${report.planningSourceFeatures?.sourceIntegrationObserved ? "observed" : "not established"}.</p>`,
    `<p>Planning: early outline ${report.planningSourceFeatures?.outlinePhaseDetected ? "observed" : "not observed"}; ${report.planningSourceFeatures?.outlineExpansionCount ?? 0} outline expansions; ${report.planningSourceFeatures?.headingEvolutionCount ?? 0} heading changes; ${report.planningSourceFeatures?.thesisRevisionCount ?? 0} thesis revisions.</p>`,
    `<p>Prompt-term uptake: ${Math.round((report.planningSourceFeatures?.earlyPromptTermUptakeRatio ?? 0) * 100)}% early and ${Math.round((report.planningSourceFeatures?.promptTermUptakeRatio ?? 0) * 100)}% in the final text.</p>`,
    "<h2>Comprehension Alignment</h2>",
    `<p>Summary submitted: ${report.comprehensionFeatures?.summarySubmitted ? "yes" : "no"}. Length: ${report.comprehensionFeatures?.summaryLength ?? 0} words. Response time: ${formatExportDuration(report.comprehensionFeatures?.summaryLatencyMs)}.</p>`,
    `<p>Claim coverage: ${report.comprehensionFeatures?.claimAssessmentAvailable ? `${Math.round((report.comprehensionFeatures?.claimCoverageRatio ?? 0) * 100)}%` : "not assessed"}. Specificity: ${report.comprehensionFeatures?.specificityScore ?? 0}%. Genericness: ${report.comprehensionFeatures?.genericnessScore ?? 0}%. Essay overlap: ${Math.round((report.comprehensionFeatures?.overlapWithEssay ?? 0) * 100)}%.</p>`,
    `<p>Response completeness: ${report.comprehensionFeatures?.answeredResponseCount ?? 0} of ${report.comprehensionFeatures?.responseCount ?? 0} prompts answered. Average answered-prompt length: ${report.comprehensionFeatures?.averageAnswerWords ?? 0} words.</p>`,
    ...(report.comprehensionResponses || []).map((item) => [
      "<article style=\"margin:16px 0;\">",
      `<p style="margin:0 0 8px 0;font-weight:600;">Q. ${escapeHtml(item.question)}</p>`,
      `<div style="background:#fff;border:1px solid #d7deea;border-radius:10px;padding:14px 16px;white-space:pre-wrap;line-height:1.7;">${escapeHtml(item.answer || "No response recorded.")}</div>`,
      "</article>"
    ].join("")),
    "<h2>Behavioral Indicators</h2>",
    `<p>${escapeHtml(String(report.behavioralRisk?.highCount ?? 0))} review, ${escapeHtml(String(report.behavioralRisk?.mediumCount ?? 0))} contextual, and ${escapeHtml(String(report.behavioralRisk?.positiveCount ?? 0))} supportive indicators. Indicator counts are not a risk score.</p>`,
    "<h2>Evidence Tags</h2>",
    tags || "<p>No evidence tags available.</p>",
    "<h2>Paste Event Cards</h2>",
    pasteCards || "<p>No paste events recorded.</p>",
    "<h2>Timeline Markers</h2>",
    markers || "<p>No timeline markers available.</p>",
    "<h2>Observations</h2>",
    observations || "<p>No observations available.</p>",
    "<h2>Submitted Text</h2>",
    `<pre>${escapeHtml(report.submittedText)}</pre>`,
    "<h2>Timed Summary</h2>",
    `<pre>${escapeHtml(report.summaryText)}</pre>`,
    "</body></html>"
  ].join("");
}

function createPdf(report: ProfessorReportResponse) {
  const lines = [
    "Neutral Evidence Report",
    "",
    "DraftProof System",
    `${report.authorCheck?.assessmentLabel ?? "Weak Process Evidence"} - ${report.authorCheck?.confidence ?? "low"} confidence (${report.authorCheck?.confidenceScore ?? 0}% data quality). ${report.authorCheck?.assessmentDetail ?? ""}`,
    ...(report.authorCheck?.confidenceReasons || []),
    `Process Support: ${report.authorCheck?.processSupportScore ?? 0}%`,
    `Process Atypicality: ${report.authorCheck?.processAtypicalityScore ?? 0}%`,
    ...scoreBreakdownLines(report),
    ...reasonLines(report),
    "",
    "Draft Build Curve",
    `25%: ${report.processFeatures?.wordsAt25PercentTime ?? 0} words; 50%: ${report.processFeatures?.wordsAt50PercentTime ?? 0} words; 75%: ${report.processFeatures?.wordsAt75PercentTime ?? 0} words; Final: ${report.processFeatures?.finalWords ?? 0} words.`,
    `Largest insertion: ${report.processFeatures?.largestInsertionWords ?? 0} words. Time to submission: ${formatExportDuration(report.processFeatures?.timeFromLargestInsertionToSubmitMs)}.`,
    `Time from 90% draft completion to submission: ${formatExportDuration(report.processFeatures?.timeFromCompleteDraftToSubmitMs)}. Immediate submission pattern: ${report.processFeatures?.immediateSubmissionAfterCompleteDraft ? "observed" : "not observed"}.`,
    `Pace: ${report.processFeatures?.burstWpm ?? 0} burst WPM; ${report.processFeatures?.maxRollingOneMinuteWpm ?? 0} one-minute WPM; ${report.processFeatures?.maxRollingTwoMinuteWpm ?? 0} two-minute WPM.`,
    `Pauses: ${report.processFeatures?.pauseCountOver30Seconds ?? 0} over 30 seconds; ${report.processFeatures?.pauseCountOverTwoMinutes ?? 0} over 2 minutes; median ${formatExportDuration(report.processFeatures?.medianPauseMs)}.`,
    `Retained paste estimate: ${report.processFeatures?.pastedFinalWordsEstimate ?? 0} words. Materially unchanged paste estimate: ${report.processFeatures?.unrevisedPastedFinalWordsEstimate ?? 0} words.`,
    `Final contribution: ${report.processFeatures?.typedFinalWordsEstimate ?? 0} typed words; ${report.processFeatures?.pastedFinalWordsEstimate ?? 0} pasted words; ${report.processFeatures?.revisedPastedFinalWordsEstimate ?? 0} revised pasted words.`,
    `Deleted contribution: ${report.processFeatures?.deletedTypedWordsEstimate ?? 0} typed words; ${report.processFeatures?.deletedPastedWordsEstimate ?? 0} pasted words.`,
    "Contribution estimate methodology: estimates use recorded event offsets and text overlap. Typed and pasted estimates partition final words; revised and unrevised estimates partition retained pasted words. Deleted estimates identify the recorded origin of removed words.",
    "",
    "Revision Depth",
    `Depth score: ${report.processFeatures?.revisionDepthScore ?? 0}/20. Estimated revised words: ${report.processFeatures?.revisedWordsEstimate ?? 0}. Revision density: ${Math.round((report.processFeatures?.revisionDensity ?? 0) * 100)}%.`,
    `${report.processFeatures?.surfaceRevisionCount ?? 0} surface; ${report.processFeatures?.localRevisionCount ?? 0} local; ${report.processFeatures?.structuralRevisionCount ?? 0} structural revision events.`,
    `${report.processFeatures?.revisedRegionCount ?? 0} revised regions; ${report.processFeatures?.paragraphReorderCount ?? 0} paragraph reorders; ${report.processFeatures?.laterSessionRevisionCount ?? 0} later-session revisions.`,
    "",
    "Source and Planning Process",
    `Citations: ${report.planningSourceFeatures?.citationInsertionCount ?? 0} additions; ${report.planningSourceFeatures?.citationRemovalCount ?? 0} removals; ${report.planningSourceFeatures?.citationReplacementCount ?? 0} replacements.`,
    `Paste classification: ${report.planningSourceFeatures?.citationOnlyPasteCount ?? 0} citation-only; ${report.planningSourceFeatures?.prosePasteCount ?? 0} prose paste events.`,
    `Planning: early outline ${report.planningSourceFeatures?.outlinePhaseDetected ? "observed" : "not observed"}; ${report.planningSourceFeatures?.outlineExpansionCount ?? 0} outline expansions; ${report.planningSourceFeatures?.headingEvolutionCount ?? 0} heading changes; ${report.planningSourceFeatures?.thesisRevisionCount ?? 0} thesis revisions.`,
    `Prompt uptake: ${Math.round((report.planningSourceFeatures?.earlyPromptTermUptakeRatio ?? 0) * 100)}% early; ${Math.round((report.planningSourceFeatures?.promptTermUptakeRatio ?? 0) * 100)}% final.`,
    "",
    "Comprehension Alignment",
    `Summary submitted: ${report.comprehensionFeatures?.summarySubmitted ? "yes" : "no"}. Length: ${report.comprehensionFeatures?.summaryLength ?? 0} words. Response time: ${formatExportDuration(report.comprehensionFeatures?.summaryLatencyMs)}.`,
    `Claim coverage: ${report.comprehensionFeatures?.claimAssessmentAvailable ? `${Math.round((report.comprehensionFeatures?.claimCoverageRatio ?? 0) * 100)}%` : "not assessed"}. Specificity: ${report.comprehensionFeatures?.specificityScore ?? 0}%. Genericness: ${report.comprehensionFeatures?.genericnessScore ?? 0}%. Essay overlap: ${Math.round((report.comprehensionFeatures?.overlapWithEssay ?? 0) * 100)}%.`,
    `Response completeness: ${report.comprehensionFeatures?.answeredResponseCount ?? 0} of ${report.comprehensionFeatures?.responseCount ?? 0} prompts answered; ${report.comprehensionFeatures?.averageAnswerWords ?? 0} average words per answered prompt.`,
    ...(report.comprehensionResponses || []).flatMap((item, index) => [
      `Comprehension prompt ${index + 1}: ${item.question}`,
      item.answer || "No response recorded."
    ]),
    "",
    "Behavioral Indicators",
    `${report.behavioralRisk?.highCount ?? 0} review, ${report.behavioralRisk?.mediumCount ?? 0} contextual, and ${report.behavioralRisk?.positiveCount ?? 0} supportive indicators. Indicator counts are not a risk score.`,
    "",
    "Evidence Tags",
    ...(report.tags || []).flatMap((item) => [
      `${item.category} (${item.disposition}): ${item.label}`,
      item.detail,
      ""
    ]),
    "Paste Event Cards",
    ...(report.pasteEventCards || []).flatMap((item) => [
      `${item.title}: ${item.wordCount} words`,
      item.detail,
      item.textPreview,
      ""
    ]),
    "Timeline Markers",
    ...(report.timelineMarkers || []).flatMap((item) => [
      `${item.kind}: ${item.label}`,
      item.detail,
      ""
    ]),
    "Observations",
    ...report.observations.flatMap((item) => [
      `${item.group}: ${item.title}`,
      item.detail,
      ""
    ]),
    "Submitted Text",
    report.submittedText,
    "",
    "Timed Summary",
    report.summaryText
  ].flatMap(wrapLine);
  return buildPdfDocument(lines);
}

const supportDimensionMaxima: Record<string, number> = {
  compositionPlausibility: 20,
  revisionDepth: 20,
  pasteIntegration: 20,
  sessionDevelopment: 15,
  comprehensionAlignment: 20,
  sourceProcess: 5
};

const atypicalityDimensionMaxima: Record<string, number> = {
  highVelocityInsertion: 25,
  unrevisedPasteDependence: 30,
  minimalRevisionPattern: 15,
  shortCompletionPattern: 15,
  weakComprehensionSignal: 15
};

function buildPdfDocument(lines: string[]) {
  const linesPerPage = 46;
  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += linesPerPage) {
    pages.push(lines.slice(index, index + linesPerPage));
  }
  if (!pages.length) pages.push([]);

  const pageObjectNumbers = pages.map((_, index) => 4 + (index * 2));
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  pages.forEach((pageLines, index) => {
    const contentObjectNumber = pageObjectNumbers[index] + 1;
    const stream = `BT /F1 10 Tf 45 750 Td 14 TL ${pageLines.map((line) => `(${pdfText(line)}) Tj T*`).join(" ")} ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  const offsets: number[] = [];
  let pdf = "%PDF-1.4\n";
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}

function scoreRows(section: string, scores: Record<string, number> | undefined, maxima: Record<string, number>) {
  return Object.entries(scores || {}).map(([key, value]) => [
    section,
    humanizeKey(key),
    `${value}/${maxima[key] ?? "?"}`,
    "Score and dimension cap"
  ]);
}

function scoreBreakdownHtml(report: ProfessorReportResponse) {
  const support = Object.entries(report.authorCheck?.supportScores || {})
    .map(([key, value]) => `${escapeHtml(humanizeKey(key))}: ${value}/${supportDimensionMaxima[key] ?? "?"}`)
    .join(" · ");
  const atypicality = Object.entries(report.authorCheck?.atypicalityScores || {})
    .map(([key, value]) => `${escapeHtml(humanizeKey(key))}: ${value}/${atypicalityDimensionMaxima[key] ?? "?"}`)
    .join(" · ");
  if (!support && !atypicality) return "";
  return `<p><strong>Support dimensions:</strong> ${support || "none"}<br><strong>Atypicality dimensions:</strong> ${atypicality || "none"}</p>`;
}

function reasonsHtml(report: ProfessorReportResponse) {
  const reasons = report.authorCheck?.reasons || [];
  if (!reasons.length) return "";
  return `<h2>Assessment Reasons</h2>${reasons.map((reason) => (
    `<article><p>${escapeHtml(reason.disposition)}</p><h3>${escapeHtml(reason.label)}</h3><p>${escapeHtml(reason.detail)}</p></article>`
  )).join("")}`;
}

function scoreBreakdownLines(report: ProfessorReportResponse) {
  return [
    "Score Dimension Breakdown",
    ...Object.entries(report.authorCheck?.supportScores || {}).map(([key, value]) => `Support - ${humanizeKey(key)}: ${value}/${supportDimensionMaxima[key] ?? "?"}`),
    ...Object.entries(report.authorCheck?.atypicalityScores || {}).map(([key, value]) => `Atypicality - ${humanizeKey(key)}: ${value}/${atypicalityDimensionMaxima[key] ?? "?"}`)
  ];
}

function reasonLines(report: ProfessorReportResponse) {
  const reasons = report.authorCheck?.reasons || [];
  if (!reasons.length) return [];
  return [
    "",
    "Assessment Reasons",
    ...reasons.flatMap((reason) => [
      `${humanizeKey(reason.disposition)}: ${reason.label}`,
      reason.detail
    ])
  ];
}

function humanizeKey(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function csvCell(value: string) {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function pdfText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "?")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function formatExportDuration(value: number | null | undefined) {
  if (value === null || value === undefined) return "not available";
  const minutes = Math.floor(value / 60_000);
  const seconds = Math.round((value % 60_000) / 1000);
  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function wrapLine(value: string) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return [""];
  const lines = [];
  for (let index = 0; index < clean.length; index += 86) {
    lines.push(clean.slice(index, index + 86));
  }
  return lines;
}
