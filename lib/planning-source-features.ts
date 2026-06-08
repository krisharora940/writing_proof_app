import { countWords, type WritingEvent } from "./writing-events.ts";

export type PlanningSourceFeatures = {
  citationInsertionCount: number;
  citationRemovalCount: number;
  citationReplacementCount: number;
  citationPasteCount: number;
  citationOnlyPasteCount: number;
  prosePasteCount: number;
  firstCitationElapsedPercent: number | null;
  sourceRevisionAfterCitationCount: number;
  sourceIntegrationObserved: boolean;
  outlinePhaseDetected: boolean;
  outlineExpansionCount: number;
  headingFirstDetected: boolean;
  headingEvolutionCount: number;
  thesisRevisionCount: number;
  draftExpansionPattern: boolean;
  promptTermUptakeRatio: number;
  earlyPromptTermUptakeRatio: number;
};

export function extractPlanningSourceFeatures(input: {
  events: WritingEvent[];
  submittedText: string;
  promptText?: string;
  submittedAt?: number | null;
}): PlanningSourceFeatures {
  const events = [...input.events].sort((a, b) => a.at - b.at);
  const editEvents = events.filter((event) => event.type !== "submit");
  const firstEditAt = editEvents[0]?.at ?? null;
  const submitAt = input.submittedAt ??
    events.findLast((event) => event.type === "submit")?.at ??
    editEvents.at(-1)?.at ??
    null;
  const duration = firstEditAt !== null && submitAt !== null ? Math.max(0, submitAt - firstEditAt) : 0;
  const frames = reconstructEventFrames(editEvents);
  const citationEvents = editEvents.filter((event) => hasCitation(event.added || "") || hasCitation(event.removed || ""));
  const firstCitationAt = citationEvents.find((event) => hasCitation(event.added || ""))?.at ?? null;
  const sourceRevisionAfterCitationCount = firstCitationAt === null
    ? 0
    : editEvents.filter((event) => event.at > firstCitationAt && removedWords(event) > 0).length;
  const pasteEvents = editEvents.filter((event) => event.type === "paste");
  const outlineFrames = frames.filter((frame) => isOutlineText(frame.text));
  const earlyCutoff = firstEditAt !== null ? firstEditAt + duration * 0.35 : null;
  const headingSets = frames.map((frame) => extractHeadings(frame.text));
  const promptTerms = meaningfulTerms(input.promptText || "");
  const earlyText = frames.findLast((frame) => earlyCutoff !== null && frame.at <= earlyCutoff)?.text || "";
  const firstOutlineWords = outlineFrames[0] ? countWords(outlineFrames[0].text) : 0;

  return {
    citationInsertionCount: editEvents.filter((event) => hasCitation(event.added || "")).length,
    citationRemovalCount: editEvents.filter((event) => hasCitation(event.removed || "")).length,
    citationReplacementCount: editEvents.filter((event) => (
      hasCitation(event.removed || "") &&
      hasCitation(event.added || "") &&
      normalizeCitationText(event.removed || "") !== normalizeCitationText(event.added || "")
    )).length,
    citationPasteCount: pasteEvents.filter((event) => hasCitation(event.added || "")).length,
    citationOnlyPasteCount: pasteEvents.filter((event) => isCitationOnlyText(event.added || "")).length,
    prosePasteCount: pasteEvents.filter((event) => !isCitationOnlyText(event.added || "")).length,
    firstCitationElapsedPercent: firstCitationAt !== null && firstEditAt !== null && duration > 0
      ? Math.round(clampRatio((firstCitationAt - firstEditAt) / duration) * 100)
      : null,
    sourceRevisionAfterCitationCount,
    sourceIntegrationObserved: citationEvents.length > 0 && (
      sourceRevisionAfterCitationCount > 0 ||
      citationEvents.some((event) => hasCitation(event.removed || ""))
    ),
    outlinePhaseDetected: outlineFrames.some((frame) => earlyCutoff !== null && frame.at <= earlyCutoff),
    outlineExpansionCount: countOutlineExpansions(frames),
    headingFirstDetected: frames.some((frame) => (
      extractHeadings(frame.text).length > 0 &&
      countWords(frame.text) <= 100 &&
      (earlyCutoff === null || frame.at <= earlyCutoff)
    )),
    headingEvolutionCount: countSetChanges(headingSets),
    thesisRevisionCount: editEvents.filter((event) => isThesisRevision(event, input.submittedText.length)).length,
    draftExpansionPattern: outlineFrames.length > 0 &&
      firstOutlineWords >= 3 &&
      countWords(input.submittedText) >= Math.max(50, firstOutlineWords * 3),
    promptTermUptakeRatio: termCoverage(promptTerms, input.submittedText),
    earlyPromptTermUptakeRatio: termCoverage(promptTerms, earlyText)
  };
}

export function planningSourceSupportScore(features: PlanningSourceFeatures) {
  let score = 0;
  if (features.citationInsertionCount > 0) score += 1;
  if (features.sourceIntegrationObserved) score += 2;
  if (features.citationReplacementCount > 0 || features.citationRemovalCount > 0) score += 1;
  if (features.citationOnlyPasteCount > 0 && features.prosePasteCount === 0) score += 1;
  return Math.min(5, score);
}

function reconstructEventFrames(events: WritingEvent[]) {
  let text = "";
  return events.map((event) => {
    if (typeof event.start === "number") {
      const start = Math.max(0, Math.min(text.length, event.start));
      const removedLength = event.removed?.length || 0;
      text = text.slice(0, start) + (event.added || "") + text.slice(start + removedLength);
    } else if (event.added) {
      text += event.added;
    }
    return { at: event.at, text };
  });
}

function hasCitation(text: string) {
  return citationMatches(text).length > 0;
}

function citationMatches(text: string) {
  return text.match(citationPattern()) || [];
}

function isCitationOnlyText(text: string) {
  if (!hasCitation(text)) return false;
  const normalized = text.trim();
  const lines = normalized.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const referenceLikeLines = lines.filter((line) => (
    /^(?:references|works cited|bibliography)$/i.test(line) ||
    /^[A-Z][A-Za-z'-]+,\s+[A-Z].*(?:19|20)\d{2}/.test(line) ||
    /^(?:\[\d{1,3}\]|\([A-Z][A-Za-z'-]+(?:,\s*|\s+)(?:19|20)\d{2}[a-z]?\))[\s.,;]*$/.test(line) ||
    /^(?:https?:\/\/|doi:)\S+$/i.test(line)
  ));
  const residual = normalized
    .replace(citationPattern(), " ")
    .replace(/(?:references|works cited|bibliography)/gi, " ");
  return referenceLikeLines.length === lines.length || countWords(residual) <= 8;
}

function citationPattern() {
  return /\([A-Z][A-Za-z'-]+(?:\s+(?:and|&)\s+[A-Z][A-Za-z'-]+)?(?:,\s*|\s+)(?:19|20)\d{2}[a-z]?(?:,\s*p{1,2}\.\s*\d+(?:-\d+)?)?\)|\[\d{1,3}\]|https?:\/\/\S+|doi:\s*\S+|(?:^|\n)\s*(?:references|works cited|bibliography)\s*(?:\n|$)/gim;
}

function isOutlineText(text: string) {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const outlineLines = lines.filter((line) => (
    /^[-*]\s+\S+/.test(line) ||
    /^\d+[.)]\s+\S+/.test(line) ||
    /^[IVX]+[.)]\s+\S+/i.test(line) ||
    /^(?:intro(?:duction)?|thesis|body|conclusion|argument|evidence)\s*:/i.test(line)
  ));
  return outlineLines.length >= 2 && outlineLines.length / Math.max(1, lines.length) >= 0.5;
}

function countOutlineExpansions(frames: Array<{ text: string }>) {
  let expansions = 0;
  let previousCount = 0;
  frames.forEach((frame) => {
    const count = outlineItemCount(frame.text);
    if (count > previousCount && previousCount > 0) expansions += 1;
    previousCount = Math.max(previousCount, count);
  });
  return expansions;
}

function outlineItemCount(text: string) {
  return text.split(/\n+/).filter((line) => (
    /^\s*(?:[-*]|\d+[.)]|[IVX]+[.)])\s+\S+/i.test(line) ||
    /^\s*(?:intro(?:duction)?|thesis|body|conclusion|argument|evidence)\s*:/i.test(line)
  )).length;
}

function extractHeadings(text: string) {
  return text.split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => (
      line.length >= 3 &&
      line.length <= 80 &&
      (
        /^#{1,6}\s+\S+/.test(line) ||
        /^(?:introduction|background|methods?|results?|discussion|conclusion|references|works cited)$/i.test(line) ||
        /^[A-Z][A-Za-z0-9 '&:-]{2,50}:$/.test(line)
      )
    ))
    .map((line) => line.toLowerCase().replace(/^#+\s*/, "").replace(/:$/, ""));
}

function countSetChanges(sets: string[][]) {
  let changes = 0;
  let previous = "";
  sets.forEach((set) => {
    const key = [...new Set(set)].sort().join("|");
    if (previous && key && key !== previous) changes += 1;
    if (key) previous = key;
  });
  return changes;
}

function isThesisRevision(event: WritingEvent, finalCharacterCount: number) {
  if (!event.removed || !event.added || event.start === undefined) return false;
  if (countWords(event.removed) < 6 || countWords(event.added) < 6) return false;
  if (event.start > Math.max(400, finalCharacterCount * 0.35)) return false;
  return /\b(?:argue|argument|claim|contend|demonstrate|because|should|thesis)\b/i.test(
    `${event.removed} ${event.added}`
  );
}

function meaningfulTerms(text: string) {
  const stop = new Set([
    "about", "after", "also", "and", "are", "because", "been", "can", "could",
    "from", "have", "into", "its", "more", "should", "that", "the", "their",
    "there", "these", "they", "this", "through", "what", "when", "which", "with",
    "write", "would", "your"
  ]);
  return [...new Set((text.toLowerCase().match(/\b[a-z][a-z'-]{3,}\b/g) || []).filter((term) => !stop.has(term)))];
}

function termCoverage(terms: string[], text: string) {
  if (!terms.length) return 0;
  const textTerms = new Set(meaningfulTerms(text));
  const covered = terms.filter((term) => textTerms.has(term)).length;
  return clampRatio(covered / terms.length);
}

function normalizeCitationText(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function removedWords(event: WritingEvent) {
  return event.removedWords || countWords(event.removed || "");
}

function clampRatio(value: number) {
  return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
}
