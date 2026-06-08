import type { SummaryComparison } from "./summary-comparison.ts";
import type { BehavioralRiskSignal } from "./behavioral-risk.ts";
import type { ComprehensionFeatures } from "./comprehension-features.ts";
import { analyzePasteRetention } from "./paste-retention.ts";
import { countWords, type Observation, type WritingEvent } from "./writing-events.ts";
import type { PlanningSourceFeatures } from "./planning-source-features.ts";

export type EvidenceTagCategory =
  | "Process Development"
  | "Revision Depth"
  | "Paste Integration"
  | "Session Topology"
  | "Comprehension"
  | "Source Behavior"
  | "Planning Behavior";
export type EvidenceDisposition = "supportive" | "review" | "contextual" | "inconclusive";

export type EvidenceTag = {
  id: string;
  label: string;
  category: EvidenceTagCategory;
  disposition: EvidenceDisposition;
  detail: string;
  eventId?: string;
  at?: number;
};

export function generateProcessEvidenceTags(events: WritingEvent[], submittedText: string): EvidenceTag[] {
  const tags: EvidenceTag[] = [];
  const pasteEvents = events.filter((event) => event.type === "paste");
  const deletionEvents = events.filter((event) => event.type === "delete" || event.deletionEvent);

  pasteEvents.forEach((event) => {
    const words = event.pasteWords || event.addedWords || countWords(event.added || "");
    const retention = analyzePasteRetention(event, submittedText);
    if (words >= 200) {
      tags.push({
        id: `paste-large-${event.id}`,
        label: "Large paste event",
        category: "Paste Integration",
        disposition: "contextual",
        detail: `${words} words were inserted through paste input.`,
        eventId: event.id,
        at: event.at
      });
    }

    if (retention.materiallyUnchanged) {
      tags.push({
        id: `paste-unchanged-${event.id}`,
        label: "Pasted text materially retained",
        category: "Paste Integration",
        disposition: "review",
        detail: `Approximately ${Math.round(retention.overlapRatio * 100)}% of the pasted segment's tokens remained in the submitted text.`,
        eventId: event.id,
        at: event.at
      });
    }
  });

  if (submittedText && deletionEvents.length === 0 && countWords(submittedText) >= 150) {
    tags.push({
      id: "revision-no-removal",
      label: "No text-removal events recorded",
      category: "Revision Depth",
      disposition: "inconclusive",
      detail: "No deletion or text-removal events were recorded; no negative inference is drawn from this fact alone."
    });
  }

  return dedupeTags(tags);
}

export function generateSummaryEvidenceTags(comparison: SummaryComparison): EvidenceTag[] {
  return dedupeTags(comparison.observations.map((observation, index) => {
    const basis = observation.basis || (comparison.fallbackUsed ? "keyword" : "claim");
    if (basis !== "claim") {
      return {
        id: `summary-context-${index}`,
        label: basis === "keyword" ? "Summary keyword comparison" : "Summary response context",
        category: "Comprehension" as const,
        disposition: "contextual" as const,
        detail: `${observation.claim} ${observation.evidence}`
      };
    }
    if (observation.category === "covered") {
      return {
        id: `summary-covered-${index}`,
        label: "Strong summary alignment",
        category: "Comprehension" as const,
        disposition: "supportive" as const,
        detail: observation.claim
      };
    }

    if (observation.category === "missing") {
      return {
        id: `summary-missing-${index}`,
        label: "Summary omits major claim",
        category: "Comprehension" as const,
        disposition: "review" as const,
        detail: observation.claim
      };
    }

    return {
      id: `summary-partial-${index}`,
      label: "Partial summary alignment",
      category: "Comprehension" as const,
      disposition: "contextual" as const,
      detail: observation.claim
    };
  }));
}

export function generateComprehensionFeatureTags(features: ComprehensionFeatures): EvidenceTag[] {
  if (!features.summarySubmitted) {
    return [{
      id: "summary-not-available",
      label: "Timed summary not available",
      category: "Comprehension",
      disposition: "inconclusive",
      detail: "No timed response is available; no negative inference is drawn."
    }];
  }

  const tags: EvidenceTag[] = [];
  if (features.responseCount > 0 && features.responseCompletionRatio < 1) {
    tags.push({
      id: "summary-incomplete-responses",
      label: "Timed response set incomplete",
      category: "Comprehension",
      disposition: "contextual",
      detail: `${features.answeredResponseCount} of ${features.responseCount} prompts received a response; no negative inference is drawn from incompleteness alone.`
    });
  }
  if (
    features.responseCount > 0 &&
    features.responseCompletionRatio === 1 &&
    features.averageAnswerWords >= 20
  ) {
    tags.push({
      id: "summary-complete-developed-responses",
      label: "Developed responses across comprehension prompts",
      category: "Comprehension",
      disposition: "supportive",
      detail: `All ${features.responseCount} prompts were answered with an average of ${features.averageAnswerWords} words per response.`
    });
  }
  if (features.independentWordingObserved && features.claimCoverageRatio >= 0.6) {
    tags.push({
      id: "summary-independent-explanation",
      label: "Summary independently explains major claims",
      category: "Comprehension",
      disposition: "supportive",
      detail: "The timed response shows claim coverage with wording distinct from the submitted paper."
    });
  }
  if (features.genericnessScore >= 60) {
    tags.push({
      id: "summary-generic",
      label: "Summary appears generic relative to essay",
      category: "Comprehension",
      disposition: "review",
      detail: `${features.genericnessScore}% genericness was estimated from response length, specificity, and generic phrasing.`
    });
  }
  if (features.summaryLength >= 12 && features.overlapWithEssay >= 0.9) {
    tags.push({
      id: "summary-heavy-overlap",
      label: "Summary heavily overlaps submitted text",
      category: "Comprehension",
      disposition: "review",
      detail: `${Math.round(features.overlapWithEssay * 100)}% token overlap was observed between the timed response and submitted paper.`
    });
  }
  if (features.majorClaimMissingCount >= 2) {
    tags.push({
      id: "summary-multiple-gaps",
      label: "Summary omits several major claims",
      category: "Comprehension",
      disposition: "review",
      detail: `${features.majorClaimMissingCount} missing-claim observations were recorded.`
    });
  }
  return dedupeTags(tags);
}

export function generateBehavioralRiskEvidenceTags(signals: BehavioralRiskSignal[]): EvidenceTag[] {
  return dedupeTags(signals.map((signal) => ({
    id: `behavioral-${signal.id}`,
    label: `${formatSeverity(signal.severity)}: ${signal.label}`,
    category: categoryForBehavioralSignal(signal),
    disposition: dispositionForSeverity(signal.severity),
    detail: signal.detail,
    eventId: signal.eventId,
    at: signal.at
  })));
}

export function generatePlanningSourceEvidenceTags(features: PlanningSourceFeatures): EvidenceTag[] {
  const tags: EvidenceTag[] = [];
  if (features.sourceIntegrationObserved) {
    tags.push({
      id: "source-integration-observed",
      label: "Source material developed through revision",
      category: "Source Behavior",
      disposition: "supportive",
      detail: `${features.sourceRevisionAfterCitationCount} revision event${features.sourceRevisionAfterCitationCount === 1 ? "" : "s"} followed citation insertion.`
    });
  }
  if (features.citationOnlyPasteCount > 0) {
    tags.push({
      id: "citation-only-paste",
      label: "Citation-only paste detected",
      category: "Source Behavior",
      disposition: "contextual",
      detail: `${features.citationOnlyPasteCount} paste event${features.citationOnlyPasteCount === 1 ? "" : "s"} appeared limited to citation or reference material.`
    });
  }
  if (features.outlinePhaseDetected) {
    tags.push({
      id: "early-outline-phase",
      label: "Early outline formation observed",
      category: "Planning Behavior",
      disposition: "supportive",
      detail: "An outline-like structure appeared during the first 35% of recorded drafting time."
    });
  }
  if (features.headingEvolutionCount > 0) {
    tags.push({
      id: "heading-evolution",
      label: "Heading structure evolved",
      category: "Planning Behavior",
      disposition: "supportive",
      detail: `${features.headingEvolutionCount} heading-set change${features.headingEvolutionCount === 1 ? "" : "s"} was estimated during drafting.`
    });
  }
  return dedupeTags(tags);
}

export function generateObservationEvidenceTags(observations: Observation[]): EvidenceTag[] {
  return dedupeTags(observations.map((observation, index) => ({
    id: `observation-${index}-${slugify(observation.title)}`,
    label: observation.title,
    category: observation.group === "Comprehension Check" ? "Comprehension" : "Process Development",
    disposition: observation.group === "Major Event"
      ? "review"
      : observation.group === "Typical Process Indicator"
        ? "supportive"
        : "contextual",
    detail: observation.detail
  })));
}

export function groupEvidenceTags(tags: EvidenceTag[]) {
  return tags.reduce<Record<EvidenceTagCategory, EvidenceTag[]>>((groups, tag) => {
    groups[tag.category].push(tag);
    return groups;
  }, {
    "Process Development": [],
    "Revision Depth": [],
    "Paste Integration": [],
    "Session Topology": [],
    "Comprehension": [],
    "Source Behavior": [],
    "Planning Behavior": []
  });
}

function dedupeTags(tags: EvidenceTag[]) {
  const seen = new Set<string>();
  return tags.filter((tag) => {
    const key = `${tag.category}:${tag.disposition}:${tag.label}:${tag.eventId || ""}:${tag.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tag";
}

function formatSeverity(severity: BehavioralRiskSignal["severity"]) {
  if (severity === "high") return "Atypical";
  if (severity === "medium") return "Context";
  return "Supportive";
}

function dispositionForSeverity(severity: BehavioralRiskSignal["severity"]): EvidenceDisposition {
  if (severity === "high") return "review";
  if (severity === "medium") return "contextual";
  return "supportive";
}

function categoryForBehavioralSignal(signal: BehavioralRiskSignal): EvidenceTagCategory {
  if (/paste|insertion/i.test(`${signal.id} ${signal.label}`)) return "Paste Integration";
  if (/session|gap/i.test(`${signal.id} ${signal.label}`)) return "Session Topology";
  if (/revision|edit|retype|non-linear|nonlinear|paragraph/i.test(`${signal.id} ${signal.label}`)) return "Revision Depth";
  return "Process Development";
}
