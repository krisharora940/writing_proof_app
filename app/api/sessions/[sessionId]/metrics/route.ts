import { NextResponse } from "next/server.js";
import { forbidden, getAuthenticatedUser, unauthorized } from "@/lib/auth";
import { getDatabaseClient, hasDatabaseUrl } from "@/lib/db";
import { getSessionMetricsPostgres } from "@/lib/postgres-repository";
import { getDemoRepositoryState, getSessionMetricsDemo } from "@/lib/server-repository";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();
  if (user.role !== "student" && user.role !== "professor") return forbidden();

  const { sessionId } = await context.params;
  const result = hasDatabaseUrl()
    ? await getSessionMetricsPostgres(getDatabaseClient(), sessionId, user)
    : getSessionMetricsDemo(getDemoRepositoryState(), sessionId, user);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.value);
}
