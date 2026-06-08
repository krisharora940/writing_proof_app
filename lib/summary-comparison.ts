import type { Observation } from "./writing-events";

export type ComparisonObservation = {
  category: "covered" | "partial" | "missing";
  basis: "claim" | "keyword" | "response-quality";
  claim: string;
  evidence: string;
};

export type SummaryComparison = {
  observations: ComparisonObservation[];
  fallbackUsed: boolean;
};

export function compareSummaryToPaper(submittedText: string, summaryText: string): SummaryComparison {
  return validateComparison(createFallbackComparison(submittedText, summaryText));
}

export function validateComparison(value: unknown): SummaryComparison {
  if (!value || typeof value !== "object") return createEmptyComparison();

  const comparison = value as Partial<SummaryComparison>;
  if (!Array.isArray(comparison.observations)) return createEmptyComparison();

  const observations = comparison.observations
    .filter(isComparisonObservation)
    .slice(0, 6)
    .map((observation) => ({
      ...observation,
      basis: observation.basis || "claim"
    }));

  return {
    observations,
    fallbackUsed: typeof comparison.fallbackUsed === "boolean" ? comparison.fallbackUsed : true
  };
}

export function comparisonToObservations(comparison: SummaryComparison): Observation[] {
  return comparison.observations.map((item) => ({
    group: "Comprehension Check",
    title: formatCategory(item.category),
    detail: `${item.claim} Evidence: ${item.evidence}`
  }));
}

function createFallbackComparison(submittedText: string, summaryText: string): SummaryComparison {
  const paperKeywords = extractKeywords(submittedText);
  const summaryKeywords = new Set(extractKeywords(summaryText));
  const observations: ComparisonObservation[] = [];

  if (!summaryText.trim()) {
    return {
      fallbackUsed: true,
      observations: [{
        category: "partial",
        basis: "response-quality",
        claim: "No timed summary was submitted.",
        evidence: "The summary response was empty."
      }]
    };
  }

  const covered = paperKeywords.filter((word) => summaryKeywords.has(word));
  const missing = paperKeywords.filter((word) => !summaryKeywords.has(word)).slice(0, 4);

  observations.push({
    category: covered.length ? "covered" : "partial",
    basis: "keyword",
    claim: `${covered.length} of ${paperKeywords.length} key paper terms appeared in the timed summary.`,
    evidence: covered.length ? covered.slice(0, 6).join(", ") : "No repeated key terms found."
  });

  if (missing.length) {
    observations.push({
      category: "missing",
      basis: "keyword",
      claim: "Some frequent paper terms did not appear in the timed summary.",
      evidence: missing.join(", ")
    });
  }

  observations.push({
    category: countWords(summaryText) >= 20 ? "covered" : "partial",
    basis: "response-quality",
    claim: "Timed summary length was reviewed against the submitted paper.",
    evidence: `${countWords(summaryText)} summary words for ${countWords(submittedText)} submitted words.`
  });

  return { observations, fallbackUsed: true };
}

function extractKeywords(text: string) {
  const stopWords = new Set([
    "about", "after", "again", "also", "because", "before", "between", "could", "every",
    "from", "have", "into", "more", "should", "that", "their", "there", "these", "they",
    "this", "through", "what", "when", "where", "which", "while", "with", "would"
  ]);

  const counts = new Map<string, number>();
  (text.toLowerCase().match(/\b[a-z][a-z'-]{3,}\b/g) || []).forEach((word) => {
    if (!stopWords.has(word)) counts.set(word, (counts.get(word) || 0) + 1);
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([word]) => word);
}

function countWords(text: string) {
  return (text.trim().match(/\b[\w'-]+\b/g) || []).length;
}

function isComparisonObservation(value: unknown): value is ComparisonObservation {
  if (!value || typeof value !== "object") return false;
  const observation = value as Partial<ComparisonObservation>;

  const basisValid = observation.basis === undefined ||
    observation.basis === "claim" ||
    observation.basis === "keyword" ||
    observation.basis === "response-quality";
  return (
    (observation.category === "covered" || observation.category === "partial" || observation.category === "missing") &&
    basisValid &&
    typeof observation.claim === "string" &&
    typeof observation.evidence === "string" &&
    observation.claim.length > 0 &&
    observation.evidence.length > 0 &&
    isNeutral(observation.claim) &&
    isNeutral(observation.evidence)
  );
}

function isNeutral(text: string) {
  return !/\b(ai generated|cheat|cheating|misconduct|plagiar|suspicion|suspicious|score)\b/i.test(text);
}

function formatCategory(category: ComparisonObservation["category"]) {
  if (category === "covered") return "Summary coverage";
  if (category === "missing") return "Summary gap";
  return "Partial summary coverage";
}

function createEmptyComparison(): SummaryComparison {
  return { observations: [], fallbackUsed: true };
}
