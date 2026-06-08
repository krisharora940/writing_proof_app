import type { BehavioralRiskSummary } from "./behavioral-risk.ts";
import type { EvidenceTag } from "./evidence-tags.ts";
import type { ComprehensionFeatures } from "./comprehension-features.ts";
import { analyzePasteRetention } from "./paste-retention.ts";
import {
  hasLargeUnrevisedNearSubmissionInsertion,
  type ProcessFeatures
} from "./process-features.ts";
import {
  planningSourceSupportScore,
  type PlanningSourceFeatures
} from "./planning-source-features.ts";
import { countWords, type WritingEvent } from "./writing-events.ts";

export type ProcessAssessmentLabel =
  | "Strong Process Evidence"
  | "Mixed Process Evidence"
  | "Weak Process Evidence"
  | "Review Recommended";

export type AuthorCheckCheck = {
  label: string;
  status: "review" | "monitor" | "clear";
  detail: string;
};

export type AuthorCheckSourceHighlight = {
  id: string;
  label: string;
  finalContributionPercent: number;
  retentionPercent: number;
  excerpt: string;
  detail: string;
};

export type ProcessFeatureScores = {
  compositionPlausibility: number;
  revisionDepth: number;
  pasteIntegration: number;
  sessionDevelopment: number;
  comprehensionAlignment: number;
  sourceProcess: number;
};

export type AtypicalityScores = {
  highVelocityInsertion: number;
  unrevisedPasteDependence: number;
  minimalRevisionPattern: number;
  shortCompletionPattern: number;
  weakComprehensionSignal: number;
};

export type AssessmentReason = {
  id: string;
  disposition: "supportive" | "review" | "inconclusive";
  label: string;
  detail: string;
};

export type AuthorCheckSummary = {
  processSupportScore: number;
  processAtypicalityScore: number;
  supportScores: ProcessFeatureScores;
  atypicalityScores: AtypicalityScores;
  confidence: "low" | "medium" | "high";
  confidenceScore: number;
  confidenceReasons: string[];
  assessmentLabel: ProcessAssessmentLabel;
  assessmentDetail: string;
  reasons: AssessmentReason[];
  writingPatternChecks: AuthorCheckCheck[];
  styleConsistencyChecks: AuthorCheckCheck[];
  sourceHighlights: AuthorCheckSourceHighlight[];
};

export function buildAuthorCheckSummary(input: {
  events: WritingEvent[];
  submittedText: string;
  summaryText: string;
  behavioralRisk: BehavioralRiskSummary;
  tags: EvidenceTag[];
  processFeatures: ProcessFeatures;
  comprehensionFeatures: ComprehensionFeatures;
  planningSourceFeatures: PlanningSourceFeatures;
}): AuthorCheckSummary {
  const finalWords = countWords(input.submittedText);
  const pasteEvents = input.events.filter((event) => event.type === "paste");
  const supportScores = buildSupportScores(
    input.processFeatures,
    input.comprehensionFeatures,
    input.planningSourceFeatures
  );
  const atypicalityScores = buildAtypicalityScores(input.processFeatures, input.comprehensionFeatures);
  const processSupportScore = sumScores(supportScores);
  const processAtypicalityScore = sumScores(atypicalityScores);
  const assessmentLabel = assessmentFor(processSupportScore, processAtypicalityScore);
  const confidence = confidenceFor(input);

  return {
    processSupportScore,
    processAtypicalityScore,
    supportScores,
    atypicalityScores,
    confidence: confidence.label,
    confidenceScore: confidence.score,
    confidenceReasons: confidence.reasons,
    assessmentLabel,
    assessmentDetail: assessmentDetail(assessmentLabel, processSupportScore, processAtypicalityScore),
    reasons: buildAssessmentReasons(supportScores, atypicalityScores, input.processFeatures),
    writingPatternChecks: buildWritingPatternChecks(input.behavioralRisk),
    styleConsistencyChecks: buildStyleChecks(input.tags, input.summaryText),
    sourceHighlights: pasteEvents.map((event, index) => {
      const words = event.pasteWords || event.addedWords || countWords(event.added || "");
      const retention = analyzePasteRetention(event, input.submittedText);
      return {
        id: `source-${event.id}`,
        label: `Paste segment ${index + 1}`,
        finalContributionPercent: finalWords
          ? clampPercent(Math.round((retention.retainedWordsEstimate / finalWords) * 100))
          : 0,
        retentionPercent: Math.round(retention.overlapRatio * 100),
        excerpt: previewText(event.added || ""),
        detail: `${words} words entered through paste input; approximately ${retention.retainedWordsEstimate} words (${Math.round(retention.overlapRatio * 100)}%) are represented in the final submission.`
      };
    })
  };
}

function buildSupportScores(
  features: ProcessFeatures,
  comprehension: ComprehensionFeatures,
  planningSource: PlanningSourceFeatures
): ProcessFeatureScores {
  return {
    compositionPlausibility: compositionPlausibilityScore(features),
    revisionDepth: clampTo(features.revisionDepthScore, 20),
    pasteIntegration: pasteIntegrationScore(features),
    sessionDevelopment: sessionDevelopmentScore(features),
    comprehensionAlignment: clampTo(comprehension.comprehensionSupportScore, 20),
    sourceProcess: planningSourceSupportScore(planningSource)
  };
}

function buildAtypicalityScores(
  features: ProcessFeatures,
  comprehension: ComprehensionFeatures
): AtypicalityScores {
  const lowRevision = features.revisionDepthScore <= 2;
  const largeUnrevisedInsertion = features.largestInsertionFinalRatio >= 0.5 &&
    features.unrevisedPasteFinalRatio >= 0.4;
  const nearSubmissionInteraction = hasLargeUnrevisedNearSubmissionInsertion(features);

  return {
    highVelocityInsertion: highVelocityInsertionScore(features),
    unrevisedPasteDependence: clampTo(Math.round(features.unrevisedPasteFinalRatio * 30), 30),
    minimalRevisionPattern: lowRevision && largeUnrevisedInsertion ? 15 : 0,
    shortCompletionPattern: nearSubmissionInteraction ? 15 : 0,
    weakComprehensionSignal: clampTo(comprehension.weakComprehensionScore, 15)
  };
}

function compositionPlausibilityScore(features: ProcessFeatures) {
  if (features.finalWords < 50) return 0;
  let score = 0;
  const quarterRatio = ratio(features.wordsAt25PercentTime, features.finalWords);
  if (features.wordsAt25PercentTime > 0 && quarterRatio <= 0.6) score += 5;
  if (
    features.wordsAt50PercentTime > features.wordsAt25PercentTime &&
    features.wordsAt75PercentTime > features.wordsAt50PercentTime
  ) score += 5;
  if (features.largestInsertionFinalRatio < 0.5) score += 5;
  if (features.activeDurationMs >= 2 * 60_000 && features.activeWpm >= 5 && features.activeWpm <= 120) {
    score += 5;
  }
  return clampTo(score, 20);
}

function pasteIntegrationScore(features: ProcessFeatures) {
  if (!features.pasteEventCount || !features.pastedWords) return 0;
  const rewrittenRatio = ratio(features.rewrittenPastedWordsEstimate, features.pastedWords);
  return clampTo(Math.round(
    rewrittenRatio * 14 +
    Math.min(4, features.revisionAfterPasteCount * 2) +
    (features.structuralRevisionCount > 0 ? 2 : 0)
  ), 20);
}

function sessionDevelopmentScore(features: ProcessFeatures) {
  const revisionReturnBonus = Math.min(3, features.laterSessionRevisionCount * 2);
  if (features.meaningfulSessionCount >= 4) return 15;
  if (features.meaningfulSessionCount === 3) return Math.min(15, 12 + revisionReturnBonus);
  if (features.meaningfulSessionCount === 2) return Math.min(15, 8 + revisionReturnBonus);
  if (features.meaningfulSessionCount === 1 && features.totalDurationMs >= 20 * 60_000) return 3;
  return 0;
}

function highVelocityInsertionScore(features: ProcessFeatures) {
  const insertionScore = features.largestInsertionFinalRatio >= 0.8
    ? 25
    : features.largestInsertionFinalRatio >= 0.5
      ? 15
      : features.largestInsertionFinalRatio >= 0.3
        ? 5
        : 0;
  const velocityScore = features.maxRollingOneMinuteWpm >= 145
    ? 20
    : features.maxRollingOneMinuteWpm >= 110
      ? 10
      : 0;
  return Math.max(insertionScore, velocityScore);
}

function buildAssessmentReasons(
  support: ProcessFeatureScores,
  atypicality: AtypicalityScores,
  features: ProcessFeatures
): AssessmentReason[] {
  const reasons: AssessmentReason[] = [];
  const supportReasons: Array<[keyof ProcessFeatureScores, string, number]> = [
    ["compositionPlausibility", "Gradual composition pattern", 20],
    ["revisionDepth", "Meaningful revision activity", 20],
    ["pasteIntegration", "Pasted material was integrated through revision", 20],
    ["sessionDevelopment", "Draft development across writing sessions", 15],
    ["comprehensionAlignment", "Timed response aligns with the submitted work", 20],
    ["sourceProcess", "Source-use development", 5]
  ];
  const reviewReasons: Array<[keyof AtypicalityScores, string, number]> = [
    ["highVelocityInsertion", "High-velocity or large insertion pattern", 25],
    ["unrevisedPasteDependence", "Materially unchanged pasted text in the final submission", 30],
    ["minimalRevisionPattern", "Large unrevised insertion with minimal revision", 15],
    ["shortCompletionPattern", "Large unrevised insertion occurred near submission", 15],
    ["weakComprehensionSignal", "Timed response provides weak comprehension evidence", 15]
  ];

  supportReasons.forEach(([key, label, maximum]) => {
    if (support[key] <= 0) return;
    reasons.push({
      id: `support-${key}`,
      disposition: "supportive",
      label,
      detail: `${support[key]} of ${maximum} support points were assigned to this dimension.`
    });
  });
  reviewReasons.forEach(([key, label, maximum]) => {
    if (atypicality[key] <= 0) return;
    reasons.push({
      id: `review-${key}`,
      disposition: "review",
      label,
      detail: `${atypicality[key]} of ${maximum} atypicality points were assigned to this dimension.`
    });
  });

  if (hasLargeUnrevisedNearSubmissionInsertion(features)) {
    const interaction = reasons.find((reason) => reason.id === "review-shortCompletionPattern");
    if (interaction) {
      interaction.detail = "The largest insertion was at least 50% of the final text, at least 40% remained materially unchanged, and submission followed within 10 minutes.";
    }
  }
  if (!reasons.length) {
    reasons.push({
      id: "inconclusive-limited-evidence",
      disposition: "inconclusive",
      label: "Limited process evidence",
      detail: "The available record does not establish meaningful supportive or atypical process patterns."
    });
  }
  return reasons;
}

function buildWritingPatternChecks(behavioralRisk: BehavioralRiskSummary): AuthorCheckCheck[] {
  if (!behavioralRisk.signals.length) {
    return [{
      label: "Writing pattern analysis",
      status: "clear",
      detail: "No notable process indicators were found in the recorded event log."
    }];
  }

  return behavioralRisk.signals.slice(0, 5).map((signal) => ({
    label: signal.label,
    status: signal.severity === "high" ? "review" : signal.severity === "medium" ? "monitor" : "clear",
    detail: signal.detail
  }));
}

function buildStyleChecks(tags: EvidenceTag[], summaryText: string): AuthorCheckCheck[] {
  const summaryMissing = tags.filter((tag) => tag.label === "Summary omits major claim").length;
  const multipleGaps = tags.some((tag) => tag.label === "Summary omits several major claims");
  const genericSummary = tags.some((tag) => tag.label === "Summary appears generic relative to essay");
  const heavyOverlap = tags.some((tag) => tag.label === "Summary heavily overlaps submitted text");
  const independentExplanation = tags.some((tag) => tag.label === "Summary independently explains major claims");
  const unchangedPaste = tags.filter((tag) => tag.label === "Pasted text materially retained").length;
  return [
    {
      label: "Comprehension alignment",
      status: genericSummary || heavyOverlap || multipleGaps ? "review" : summaryMissing ? "monitor" : independentExplanation ? "clear" : "monitor",
      detail: comprehensionDetail({
        summaryText,
        summaryMissing,
        multipleGaps,
        genericSummary,
        heavyOverlap,
        independentExplanation
      })
    },
    {
      label: "Paste retention",
      status: unchangedPaste ? "review" : "clear",
      detail: unchangedPaste
        ? `${unchangedPaste} pasted segment remained materially unchanged in the final text.`
        : "No materially unchanged pasted segment was identified."
    }
  ];
}

function comprehensionDetail(input: {
  summaryText: string;
  summaryMissing: number;
  multipleGaps: boolean;
  genericSummary: boolean;
  heavyOverlap: boolean;
  independentExplanation: boolean;
}) {
  if (!input.summaryText) return "Timed comprehension response has not been submitted; no negative inference is drawn.";
  if (input.heavyOverlap) return "The timed response heavily overlaps the submitted text and should be interpreted with context.";
  if (input.genericSummary) return "The timed response appears generic relative to the submitted paper.";
  if (input.multipleGaps) return "The timed response omits several major claim areas.";
  if (input.independentExplanation) return "The timed response explains major claims with independently worded language.";
  if (input.summaryMissing) return `${input.summaryMissing} major claim area needs a second look.`;
  return "The timed response provides limited alignment evidence.";
}

function assessmentFor(support: number, atypicality: number): ProcessAssessmentLabel {
  if (atypicality >= 70) return "Review Recommended";
  if (support >= 70 && atypicality < 40) return "Strong Process Evidence";
  if (support >= 45) return "Mixed Process Evidence";
  return "Weak Process Evidence";
}

function assessmentDetail(label: ProcessAssessmentLabel, support: number, atypicality: number) {
  if (label === "Review Recommended") {
    return `The process contains substantial review indicators. Supportive evidence is reported separately and does not cancel them out.`;
  }
  if (label === "Strong Process Evidence") {
    return "The recorded process contains substantial evidence of drafting, revision, or comprehension with limited atypical indicators.";
  }
  if (label === "Mixed Process Evidence") {
    return "The record contains meaningful supportive evidence alongside process indicators that need context.";
  }
  return `The record contains limited affirmative process evidence. This is inconclusive, not evidence of misconduct (${support}% support; ${atypicality}% atypicality).`;
}

function confidenceFor(input: {
  events: WritingEvent[];
  submittedText: string;
  summaryText: string;
  processFeatures: ProcessFeatures;
  comprehensionFeatures: ComprehensionFeatures;
}) {
  const editEvents = input.events.filter((event) => ["insert", "delete", "paste"].includes(event.type));
  const detailedEvents = editEvents.filter((event) => (
    typeof event.start === "number" &&
    (event.added !== undefined || event.removed !== undefined)
  ));
  const detailRatio = ratio(detailedEvents.length, editEvents.length);
  const timestampsValid = input.events.every((event, index) => (
    Number.isFinite(event.at) && (index === 0 || event.at >= input.events[index - 1].at)
  ));
  const finalWords = countWords(input.submittedText);
  let score = 0;
  const reasons: string[] = [];

  if (finalWords >= 50) {
    score += finalWords >= 150 ? 20 : 12;
    reasons.push("Final submitted text is available.");
  } else if (finalWords > 0) {
    score += 5;
    reasons.push("Only a short final text is available.");
  } else {
    reasons.push("Final submitted text is unavailable.");
  }

  if (editEvents.length >= 10) {
    score += 20;
    reasons.push("The event history contains at least 10 edit events.");
  } else if (editEvents.length >= 3) {
    score += 10;
    reasons.push("The event history is limited but usable.");
  } else {
    reasons.push("The event history is sparse.");
  }

  if (detailRatio >= 0.8) {
    score += 20;
    reasons.push("Most edit events include offsets and changed text.");
  } else if (detailRatio >= 0.5) {
    score += 10;
    reasons.push("Some edit events include detailed change data.");
  } else {
    reasons.push("Most edit events lack detailed change data.");
  }

  if (timestampsValid && editEvents.length > 0) {
    score += 10;
    reasons.push("Event timestamps are ordered and usable.");
  } else if (editEvents.length > 0) {
    reasons.push("Event timestamp quality is incomplete.");
  }

  if (input.processFeatures.timeFromLargestInsertionToSubmitMs !== null) {
    score += 10;
    reasons.push("Submission timing is available.");
  } else {
    reasons.push("Submission timing is unavailable.");
  }

  if (input.comprehensionFeatures.summarySubmitted && input.comprehensionFeatures.summaryLength >= 15) {
    score += input.comprehensionFeatures.summaryLatencyMs !== null ? 10 : 6;
    reasons.push("A substantive timed response is available.");
  } else if (input.comprehensionFeatures.summarySubmitted) {
    score += 3;
    reasons.push("A short timed response is available.");
  } else {
    reasons.push("No timed response is available; no negative inference is drawn.");
  }

  if (input.comprehensionFeatures.claimAssessmentAvailable) {
    score += 20;
    reasons.push("Claim-level comprehension assessment is available.");
  } else if (input.comprehensionFeatures.comparisonFallbackUsed) {
    reasons.push("Comprehension comparison used keyword fallback and is not treated as claim-level evidence.");
  }

  const boundedScore = clampPercent(score);
  return {
    score: boundedScore,
    label: boundedScore >= 75 ? "high" as const : boundedScore >= 40 ? "medium" as const : "low" as const,
    reasons
  };
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function clampTo(value: number, maximum: number) {
  return Math.max(0, Math.min(maximum, Math.round(value)));
}

function sumScores(scores: Record<string, number>) {
  return clampPercent(Object.values(scores).reduce((total, value) => total + value, 0));
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? Math.max(0, Math.min(1, numerator / denominator)) : 0;
}

function previewText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}
