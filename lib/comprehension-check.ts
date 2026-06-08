export const DEFAULT_COMPREHENSION_QUESTIONS = [
  "What was the central claim or solution in your submission?",
  "Which evidence, method, or steps did you use to support it?",
  "What part of your submitted work would you revise first if you had more time?"
] as const;

export const DEFAULT_COMPREHENSION_TIME_LIMIT_MINUTES = 10;
export const MAX_COMPREHENSION_TIME_LIMIT_MINUTES = 10;
export const MAX_COMPREHENSION_QUESTIONS = 3;

export type ComprehensionCheckSettings = {
  enabled: boolean;
  timeLimitMinutes: number;
  questions: string[];
};

export function normalizeComprehensionCheckSettings(
  value: Partial<ComprehensionCheckSettings> | null | undefined
): ComprehensionCheckSettings {
  const enabled = value?.enabled !== false;
  const timeLimitMinutes = clampTimeLimit(value?.timeLimitMinutes);
  const suppliedQuestions = Array.isArray(value?.questions) ? value.questions : [];
  const questions = Array.from({ length: MAX_COMPREHENSION_QUESTIONS }, (_, index) => {
    const candidate = typeof suppliedQuestions[index] === "string" ? suppliedQuestions[index].trim() : "";
    return candidate || DEFAULT_COMPREHENSION_QUESTIONS[index];
  });

  return {
    enabled,
    timeLimitMinutes,
    questions
  };
}

function clampTimeLimit(value: number | null | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_COMPREHENSION_TIME_LIMIT_MINUTES;
  return Math.max(1, Math.min(MAX_COMPREHENSION_TIME_LIMIT_MINUTES, Math.round(value as number)));
}
