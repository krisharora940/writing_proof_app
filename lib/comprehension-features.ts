import { tokenOverlapRatio, tokenize } from "./paste-retention.ts";
import type { SummaryComparison } from "./summary-comparison.ts";
import { countWords } from "./writing-events.ts";
import { comprehensionResponseStats, type ComprehensionResponseItem } from "./comprehension-response.ts";

export type ComprehensionFeatures = {
  summarySubmitted: boolean;
  summaryLength: number;
  summaryLatencyMs: number | null;
  responseCount: number;
  answeredResponseCount: number;
  responseCompletionRatio: number;
  averageAnswerWords: number;
  shortestAnswerWords: number;
  comparisonFallbackUsed: boolean;
  claimAssessmentAvailable: boolean;
  coveredClaimCount: number;
  partialClaimCount: number;
  majorClaimMissingCount: number;
  claimCoverageRatio: number;
  specificityScore: number;
  genericnessScore: number;
  overlapWithEssay: number;
  independentWordingObserved: boolean;
  comprehensionSupportScore: number;
  weakComprehensionScore: number;
};

const GENERIC_TERMS = new Set([
  "answer", "assignment", "essay", "evidence", "important", "paper", "point",
  "question", "response", "something", "summary", "topic", "thing", "things",
  "this", "that", "there", "they", "what", "which", "would"
]);

export function extractComprehensionFeatures(input: {
  submittedText: string;
  summaryText: string;
  comparison: SummaryComparison;
  responses?: ComprehensionResponseItem[];
  startedAt?: number | null;
  completedAt?: number | null;
}): ComprehensionFeatures {
  const summarySubmitted = Boolean(input.summaryText.trim());
  const summaryLength = countWords(input.summaryText);
  const responseStats = comprehensionResponseStats(input.responses || []);
  const claimObservations = input.comparison.observations.filter((item) => (
    item.basis === "claim" || (!input.comparison.fallbackUsed && item.basis === undefined)
  ));
  const claimAssessmentAvailable = claimObservations.length > 0 && !input.comparison.fallbackUsed;
  const coveredClaimCount = claimObservations.filter((item) => item.category === "covered").length;
  const partialClaimCount = claimObservations.filter((item) => item.category === "partial").length;
  const majorClaimMissingCount = claimObservations.filter((item) => item.category === "missing").length;
  const claimCount = coveredClaimCount + partialClaimCount + majorClaimMissingCount;
  const claimCoverageRatio = claimCount
    ? roundRatio((coveredClaimCount + partialClaimCount * 0.5) / claimCount)
    : 0;
  const summaryTokens = tokenize(input.summaryText);
  const specificTokens = summaryTokens.filter((token) => !GENERIC_TERMS.has(token));
  const uniqueSpecificTokens = new Set(specificTokens);
  const specificityScore = summarySubmitted
    ? clampPercent(Math.round(
      Math.min(1, uniqueSpecificTokens.size / 18) * 60 +
      Math.min(1, summaryLength / 40) * 20 +
      (claimAssessmentAvailable ? claimCoverageRatio * 20 : 0)
    ))
    : 0;
  const genericPhraseCount = countGenericPhrases(input.summaryText);
  const genericnessScore = summarySubmitted
    ? clampPercent(Math.round(
      Math.max(0, 45 - specificityScore * 0.4) +
      genericPhraseCount * 15 +
      (summaryLength < 15 ? 25 : 0)
    ))
    : 0;
  const overlapWithEssay = tokenOverlapRatio(input.summaryText, input.submittedText);
  const independentWordingObserved = summarySubmitted &&
    summaryLength >= 15 &&
    overlapWithEssay >= 0.15 &&
    overlapWithEssay <= 0.75;
  const comprehensionSupportScore = summarySubmitted
    ? Math.min(20, Math.round(
      (claimAssessmentAvailable ? claimCoverageRatio * 10 : 0) +
      specificityScore / 20 +
      (independentWordingObserved ? 4 : 0) +
      (responseStats.responseCount > 0 ? responseStats.responseCompletionRatio : 1)
    ))
    : 0;
  const weakComprehensionScore = summarySubmitted
    ? Math.min(15, Math.round(
      (claimAssessmentAvailable ? (1 - claimCoverageRatio) * 7 : 0) +
      genericnessScore / 25 +
      (summaryLength >= 12 && overlapWithEssay >= 0.9 ? 4 : 0) +
      (responseStats.responseCount > 0 ? (1 - responseStats.responseCompletionRatio) * 3 : 0)
    ))
    : 0;

  return {
    summarySubmitted,
    summaryLength,
    summaryLatencyMs: validLatency(input.startedAt, input.completedAt),
    ...responseStats,
    comparisonFallbackUsed: input.comparison.fallbackUsed,
    claimAssessmentAvailable,
    coveredClaimCount,
    partialClaimCount,
    majorClaimMissingCount,
    claimCoverageRatio,
    specificityScore,
    genericnessScore,
    overlapWithEssay,
    independentWordingObserved,
    comprehensionSupportScore,
    weakComprehensionScore
  };
}

function countGenericPhrases(text: string) {
  const normalized = text.toLowerCase();
  return [
    "the paper is about",
    "this essay discusses",
    "the main point is",
    "there are many reasons",
    "it is important"
  ].filter((phrase) => normalized.includes(phrase)).length;
}

function validLatency(startedAt?: number | null, completedAt?: number | null) {
  if (startedAt === null || startedAt === undefined || completedAt === null || completedAt === undefined) {
    return null;
  }
  return Math.max(0, completedAt - startedAt);
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function roundRatio(value: number) {
  return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
}
