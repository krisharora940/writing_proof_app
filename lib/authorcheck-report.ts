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
  const similarityPercent = clampPercent(Math.round(
    rawPercent * 0.35 +
    input.behavioralRisk.totalPoints * 12 +
    input.behavioralRisk.highCount * 8 +
    input.behavioralRisk.mediumCount * 4 -
    input.behavioralRisk.positiveCount * 5
  ));
  const flag = flagFor(similarityPercent, input.behavioralRisk);

  return {
    similarityPercent,
    flag,
    flagLabel: flag === "red" ? "More Atypical" : flag === "yellow" ? "Mixed Signals" : "More Typical",
    flagDetail: flagDetail(flag, similarityPercent),
    writingPatternChecks: buildWritingPatternChecks(input.behavioralRisk),
    styleConsistencyChecks: buildStyleChecks(input.tags, input.summaryText),
    sourceHighlights: pasteEvents.map((event, index) => {
      const words = event.pasteWords || event.addedWords || countWords(event.added || "");
      return {
        id: `source-${event.id}`,
        label: `Paste segment ${index + 1}`,
        similarityPercent: finalWords ? clampPercent(Math.round((words / finalWords) * 100)) : 0,
        excerpt: previewText(event.added || ""),
        detail: `${words} words entered through paste input and account for ${finalWords ? Math.round((words / finalWords) * 100) : 0}% of the final submission.`
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
      label: "Paste retention",
      status: unchangedPaste ? "review" : "clear",
      detail: unchangedPaste
        ? `${unchangedPaste} pasted segment remained materially unchanged in the final text.`
        : "No materially unchanged pasted segment was identified."
    }
  ];
}

function flagFor(percent: number, behavioralRisk: BehavioralRiskSummary): AuthorCheckFlag {
  if (percent > 60 || behavioralRisk.highCount >= 2) return "red";
  if (percent >= 30 || behavioralRisk.highCount >= 1 || behavioralRisk.mediumCount >= 2) return "yellow";
  return "green";
}

function flagDetail(flag: AuthorCheckFlag, percent: number) {
  if (flag === "red") return `More atypical process indicators were observed in this session mix (${percent}%).`;
  if (flag === "yellow") return `The process log shows a mixed set of indicators that may merit a second look (${percent}%).`;
  return `The recorded process indicators looked relatively typical overall (${percent}%).`;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(98, value));
}

function previewText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}
