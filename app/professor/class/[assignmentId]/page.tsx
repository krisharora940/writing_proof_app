import { AuthorCheckApp } from "@/components/figma-authorcheck-client";

type ProfessorClassPageProps = {
  params: Promise<{ assignmentId: string }>;
};

export default async function ProfessorClassPage({ params }: ProfessorClassPageProps) {
  const { assignmentId } = await params;
  return <AuthorCheckApp page="class" role="professor" assignmentId={assignmentId} />;
}
