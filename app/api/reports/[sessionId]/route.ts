import { NextResponse } from "next/server.js";
import { forbidden, getAuthenticatedUser, unauthorized } from "@/lib/auth";
import { getDatabaseClient, hasDatabaseUrl } from "@/lib/db";
import { getProfessorReportPostgres } from "@/lib/postgres-repository";
import { rateLimit } from "@/lib/rate-limit";
import { getDemoRepositoryState, getProfessorReportDemo } from "@/lib/server-repository";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const limited = rateLimit(request, "report-read", { limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();
  if (user.role !== "professor") return forbidden("Only professors can load reports.");

  const { sessionId } = await context.params;
  const result = hasDatabaseUrl()
    ? await getProfessorReportPostgres(getDatabaseClient(), sessionId, user.id)
    : getProfessorReportDemo(getDemoRepositoryState(), sessionId, user.id);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.value);
}
