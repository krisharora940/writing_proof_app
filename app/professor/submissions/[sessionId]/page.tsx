import { AuthorCheckApp } from "@/components/figma-authorcheck-client";

type ProfessorSubmissionPageProps = {
  params: Promise<{ sessionId: string }>;
};

export default async function ProfessorSubmissionPage({ params }: ProfessorSubmissionPageProps) {
  const { sessionId } = await params;
  return <AuthorCheckApp page="review" role="professor" sessionId={sessionId} />;
}
