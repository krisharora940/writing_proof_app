import { countWords } from "./writing-events.ts";

export type ComprehensionResponseItem = {
  question: string;
  answer: string;
};

export function normalizeComprehensionResponses(value: unknown): ComprehensionResponseItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 3)
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      question: typeof item.question === "string" ? item.question.trim().slice(0, 500) : "",
      answer: typeof item.answer === "string" ? item.answer.trim().slice(0, 10_000) : ""
    }))
    .filter((item) => item.question.length > 0);
}

export function comprehensionAnswerText(items: ComprehensionResponseItem[] | undefined, fallbackText = "") {
  const answerText = (items || []).map((item) => item.answer).filter(Boolean).join("\n\n");
  return answerText || fallbackText.trim();
}

export function comprehensionResponseStats(items: ComprehensionResponseItem[]) {
  const answerWordCounts = items.map((item) => countWords(item.answer));
  const answeredWordCounts = answerWordCounts.filter((count) => count > 0);
  const answeredResponseCount = answeredWordCounts.length;
  return {
    responseCount: items.length,
    answeredResponseCount,
    responseCompletionRatio: items.length ? answeredResponseCount / items.length : 0,
    averageAnswerWords: answeredResponseCount
      ? Math.round(answeredWordCounts.reduce((sum, count) => sum + count, 0) / answeredResponseCount)
      : 0,
    shortestAnswerWords: answeredResponseCount ? Math.min(...answeredWordCounts) : 0
  };
}
