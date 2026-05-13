import { AuthorCheckApp } from "@/components/figma-authorcheck-client";

type StudentAssignmentPageProps = {
  params: Promise<{ assignmentId: string }>;
};

export default async function StudentAssignmentPage({ params }: StudentAssignmentPageProps) {
  const { assignmentId } = await params;
  return <AuthorCheckApp page="assignment" role="student" assignmentId={assignmentId} />;
}
