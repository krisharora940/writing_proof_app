import type { BehavioralRiskSummary } from "./behavioral-risk.ts";
import type { EvidenceTag } from "./evidence-tags.ts";
import { countWords, type WritingEvent } from "./writing-events.ts";

export type AuthorCheckFlag = "red" | "yellow" | "green";

export type AuthorCheckCheck = {
  label: string;
  status: "review" | "monitor" | "clear";
  detail: string;
};

export type AuthorCheckSourceHighlight = {
  id: string;
  label: string;
  similarityPercent: number;
  excerpt: string;
  detail: string;
};

export type AuthorCheckSummary = {
  similarityPercent: number;
  flag: AuthorCheckFlag;
  flagLabel: string;
  flagDetail: string;
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
}): AuthorCheckSummary {
  const finalWords = countWords(input.submittedText);
  const pasteEvents = input.events.filter((event) => event.type === "paste");
  const pastedWords = pasteEvents.reduce((total, event) => (
    total + (event.pasteWords || event.addedWords || countWords(event.added || ""))
  ), 0);
  const rawPercent = finalWords
    ? Math.round((pastedWords / finalWords) * 100)
    : 0;
  const similarityPercent = clampPercent(
    rawPercent + input.behavioralRisk.highCount * 10 + input.behavioralRisk.mediumCount * 4 - input.behavioralRisk.positiveCount * 3
  );
  const flag = flagFor(similarityPercent, input.behavioralRisk);

  return {
    similarityPercent,
    flag,
    flagLabel: flag === "red" ? "Red Flag" : flag === "yellow" ? "Yellow Flag" : "Green Flag",
    flagDetail: flagDetail(flag, similarityPercent),
    writingPatternChecks: buildWritingPatternChecks(input.behavioralRisk),
    styleConsistencyChecks: buildStyleChecks(input.tags, input.summaryText),
    sourceHighlights: pasteEvents.map((event, index) => {
      const words = event.pasteWords || event.addedWords || countWords(event.added || "");
      return {
        id: `source-${event.id}`,
        label: `Matched writing segment ${index + 1}`,
        similarityPercent: finalWords ? clampPercent(Math.round((words / finalWords) * 100)) : 0,
        excerpt: previewText(event.added || ""),
        detail: `${words} words entered through paste input.`
      };
    })
  };
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
  const unchangedPaste = tags.filter((tag) => tag.label === "Text unchanged after paste").length;
  return [
    {
      label: "Summary consistency",
      status: summaryMissing ? "monitor" : summaryText ? "clear" : "monitor",
      detail: summaryText
        ? summaryMissing
          ? `${summaryMissing} major claim area needs a second look.`
          : "Timed comprehension response aligns with the submitted paper."
        : "Timed comprehension response has not been submitted."
    },
    {
      label: "Source highlighting",
      status: unchangedPaste ? "review" : "clear",
      detail: unchangedPaste
        ? `${unchangedPaste} pasted segment remained materially unchanged in the final text.`
        : "No unchanged pasted source segment was identified."
    }
  ];
}

function flagFor(percent: number, behavioralRisk: BehavioralRiskSummary): AuthorCheckFlag {
  if (percent > 60 || behavioralRisk.highCount >= 2) return "red";
  if (percent >= 30 || behavioralRisk.highCount >= 1 || behavioralRisk.mediumCount >= 2) return "yellow";
  return "green";
}

function flagDetail(flag: AuthorCheckFlag, percent: number) {
  if (flag === "red") return `High review priority based on ${percent}% AuthorCheck similarity indicators.`;
  if (flag === "yellow") return `Moderate concern based on ${percent}% AuthorCheck similarity indicators.`;
  return `Likely originality based on ${percent}% AuthorCheck similarity indicators.`;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(98, value));
}

function previewText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}
