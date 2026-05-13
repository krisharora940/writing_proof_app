import { AuthorCheckApp } from "@/components/figma-authorcheck-client";

type InstructorReviewPageProps = {
  params: Promise<{ sessionId: string }>;
};

export default async function InstructorReviewPage({ params }: InstructorReviewPageProps) {
  const { sessionId } = await params;
  return <AuthorCheckApp page="review" role="professor" sessionId={sessionId} />;
}
