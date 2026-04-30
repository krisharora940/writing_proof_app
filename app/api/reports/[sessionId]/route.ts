import { NextResponse } from "next/server";
import { getDatabaseClient, hasDatabaseUrl } from "@/lib/db";
import { getProfessorReportPostgres } from "@/lib/postgres-repository";
import { getDemoRepositoryState, getProfessorReportDemo } from "@/lib/server-repository";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { sessionId } = await context.params;
  const professorId = new URL(request.url).searchParams.get("professorId");

  if (!professorId) {
    return NextResponse.json({ error: "Missing professorId" }, { status: 400 });
  }

  const result = hasDatabaseUrl()
    ? await getProfessorReportPostgres(getDatabaseClient(), sessionId, professorId)
    : getProfessorReportDemo(getDemoRepositoryState(), sessionId, professorId);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.value);
}
