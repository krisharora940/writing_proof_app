import { AuthorCheckApp } from "@/components/figma-authorcheck-client";

type StudentQuizPageProps = {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ minutes?: string; question?: string | string[] }>;
};

export default async function StudentQuizPage({ params, searchParams }: StudentQuizPageProps) {
  const { sessionId } = await params;
  const resolvedSearchParams = await searchParams;
  const timeLimitMinutes = resolvedSearchParams.minutes ? Number(resolvedSearchParams.minutes) : undefined;
  const questions = Array.isArray(resolvedSearchParams.question)
    ? resolvedSearchParams.question
    : resolvedSearchParams.question
      ? [resolvedSearchParams.question]
      : undefined;
  return <AuthorCheckApp page="quiz" role="student" sessionId={sessionId} comprehensionTimeLimitMinutes={timeLimitMinutes} comprehensionQuestions={questions} />;
}
