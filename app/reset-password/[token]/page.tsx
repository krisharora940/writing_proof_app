import { AuthorCheckApp } from "@/components/figma-authorcheck-client";

type ResetPasswordPageProps = {
  params: Promise<{ token: string }>;
};

export default async function ResetPasswordPage({ params }: ResetPasswordPageProps) {
  const { token } = await params;
  return <AuthorCheckApp page="reset-password" resetToken={token} />;
}
