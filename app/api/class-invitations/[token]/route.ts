import { NextResponse } from "next/server.js";
import { getDatabaseClient, hasDatabaseUrl } from "@/lib/db";
import { getClassInvitationByTokenPostgres } from "@/lib/postgres-repository";
import { getClassInvitationByTokenDemo, getDemoRepositoryState } from "@/lib/server-repository";

type RouteContext = {
  params: Promise<{ token: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  const result = hasDatabaseUrl()
    ? await getClassInvitationByTokenPostgres(getDatabaseClient(), token)
    : getClassInvitationByTokenDemo(getDemoRepositoryState(), token);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.value);
}
