import { countWords, type WritingEvent } from "./writing-events.ts";

export type PasteRetention = {
  eventId: string;
  pastedWords: number;
  retainedWordsEstimate: number;
  overlapRatio: number;
  materiallyUnchanged: boolean;
};

const MATERIAL_RETENTION_THRESHOLD = 0.85;

export function analyzePasteRetention(event: WritingEvent, submittedText: string): PasteRetention {
  const pastedWords = event.pasteWords || event.addedWords || countWords(event.added || "");
  const overlapRatio = tokenOverlapRatio(event.added || "", submittedText);

  return {
    eventId: event.id,
    pastedWords,
    retainedWordsEstimate: Math.min(pastedWords, Math.round(pastedWords * overlapRatio)),
    overlapRatio,
    materiallyUnchanged: pastedWords >= 50 && overlapRatio >= MATERIAL_RETENTION_THRESHOLD
  };
}

export function tokenOverlapRatio(source: string, target: string) {
  const sourceTokens = tokenize(source);
  const targetTokens = tokenize(target);
  if (!sourceTokens.length || !targetTokens.length) return 0;

  const targetCounts = tokenCounts(targetTokens);
  let overlap = 0;
  sourceTokens.forEach((token) => {
    const available = targetCounts.get(token) || 0;
    if (!available) return;
    overlap += 1;
    targetCounts.set(token, available - 1);
  });

  return Math.round((overlap / sourceTokens.length) * 1000) / 1000;
}

export function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function tokenCounts(tokens: string[]) {
  const counts = new Map<string, number>();
  tokens.forEach((token) => counts.set(token, (counts.get(token) || 0) + 1));
  return counts;
}
