import WorkspaceClient from "@/components/workspace-client";

type ProfessorSubmissionPageProps = {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ assignmentId?: string }>;
};

export default async function ProfessorSubmissionPage({ params, searchParams }: ProfessorSubmissionPageProps) {
  const { sessionId } = await params;
  const { assignmentId } = await searchParams;

  return (
    <WorkspaceClient
      initialProfessorAssignmentId={assignmentId}
      initialProfessorSessionId={sessionId}
      professorDetailMode
      requiredRole="professor"
    />
  );
}
