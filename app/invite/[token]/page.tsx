import { AuthorCheckApp } from "@/components/figma-authorcheck-client";

type InvitePageProps = {
  params: Promise<{ token: string }>;
};

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;
  return <AuthorCheckApp page="invite" invitationToken={token} />;
}
