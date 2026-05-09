import type { SummaryComparison } from "./summary-comparison.ts";
import type { BehavioralRiskSignal } from "./behavioral-risk.ts";
import { countWords, type Observation, type WritingEvent } from "./writing-events.ts";

export type EvidenceTagCategory = "Process Event" | "Revision Pattern" | "Behavioral Indicator" | "Summary Alignment" | "Report Observation";

export type EvidenceTag = {
  id: string;
  label: string;
  category: EvidenceTagCategory;
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
    if (words >= 200) {
      tags.push({
        id: `paste-large-${event.id}`,
        label: "Large paste event",
        category: "Process Event",
        detail: `${words} words were inserted through paste input.`,
        eventId: event.id,
        at: event.at
      });
    }

    if (words >= 50 && event.added && submittedText.includes(event.added)) {
      tags.push({
        id: `paste-unchanged-${event.id}`,
        label: "Text unchanged after paste",
        category: "Revision Pattern",
        detail: "A pasted text segment remained present in the submitted text.",
        eventId: event.id,
        at: event.at
      });
    }
  });

  if (submittedText && deletionEvents.length === 0 && countWords(submittedText) >= 150) {
    tags.push({
      id: "revision-no-removal",
      label: "No text-removal revision",
      category: "Revision Pattern",
      detail: "No deletion or text-removal events were recorded before submission."
    });
  }

  return dedupeTags(tags);
}

export function generateSummaryEvidenceTags(comparison: SummaryComparison): EvidenceTag[] {
  return dedupeTags(comparison.observations.map((observation, index) => {
    if (observation.category === "covered") {
      return {
        id: `summary-covered-${index}`,
        label: "Strong summary alignment",
        category: "Summary Alignment" as const,
        detail: observation.claim
      };
    }

    if (observation.category === "missing") {
      return {
        id: `summary-missing-${index}`,
        label: "Summary omits major claim",
        category: "Summary Alignment" as const,
        detail: observation.claim
      };
    }

    return {
      id: `summary-partial-${index}`,
      label: "Partial summary alignment",
      category: "Summary Alignment" as const,
      detail: observation.claim
    };
  }));
}

export function generateBehavioralRiskEvidenceTags(signals: BehavioralRiskSignal[]): EvidenceTag[] {
  return dedupeTags(signals.map((signal) => ({
    id: `behavioral-${signal.id}`,
    label: `${formatSeverity(signal.severity)}: ${signal.label}`,
    category: "Behavioral Indicator" as const,
    detail: signal.detail,
    eventId: signal.eventId,
    at: signal.at
  })));
}

export function generateObservationEvidenceTags(observations: Observation[]): EvidenceTag[] {
  return dedupeTags(observations.map((observation, index) => ({
    id: `observation-${index}-${slugify(observation.title)}`,
    label: observation.title,
    category: "Report Observation",
    detail: observation.detail
  })));
}

export function groupEvidenceTags(tags: EvidenceTag[]) {
  return tags.reduce<Record<EvidenceTagCategory, EvidenceTag[]>>((groups, tag) => {
    groups[tag.category].push(tag);
    return groups;
  }, {
    "Process Event": [],
    "Revision Pattern": [],
    "Behavioral Indicator": [],
    "Summary Alignment": [],
    "Report Observation": []
  });
}

function dedupeTags(tags: EvidenceTag[]) {
  const seen = new Set<string>();
  return tags.filter((tag) => {
    const key = `${tag.category}:${tag.label}:${tag.eventId || ""}:${tag.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tag";
}

function formatSeverity(severity: BehavioralRiskSignal["severity"]) {
  if (severity === "high") return "High";
  if (severity === "medium") return "Medium";
  return "Positive";
}
