import { AuthorCheckApp } from "@/components/figma-authorcheck-client";

type InstructorClassPageProps = {
  params: Promise<{ assignmentId: string }>;
};

export default async function InstructorClassPage({ params }: InstructorClassPageProps) {
  const { assignmentId } = await params;
  return <AuthorCheckApp page="class" role="professor" assignmentId={assignmentId} />;
}
