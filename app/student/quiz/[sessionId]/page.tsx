import { AuthorCheckApp } from "@/components/figma-authorcheck-client";

type StudentQuizPageProps = {
  params: Promise<{ sessionId: string }>;
};

export default async function StudentQuizPage({ params }: StudentQuizPageProps) {
  const { sessionId } = await params;
  return <AuthorCheckApp page="quiz" role="student" sessionId={sessionId} />;
}
