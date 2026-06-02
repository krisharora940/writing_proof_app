import { NextResponse } from "next/server.js";
import { forbidden, getAuthenticatedUser, unauthorized } from "@/lib/auth";
import { getDatabaseClient, hasDatabaseUrl } from "@/lib/db";
import { saveProfessorGradePostgres } from "@/lib/postgres-repository";
import { enforceSameOrigin } from "@/lib/request-security";
import { getDemoRepositoryState, saveProfessorGradeDemo } from "@/lib/server-repository";
import type { SaveProfessorGradeBody } from "@/lib/server-boundaries";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const blocked = enforceSameOrigin(request, { requireOrigin: true });
  if (blocked) return blocked;
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();
  if (user.role !== "professor") return forbidden("Only professors can save grades.");

  const body = await request.json().catch(() => null);
  if (!isSaveGradeBody(body)) return NextResponse.json({ error: "Invalid grade request." }, { status: 400 });

  const { sessionId } = await context.params;
  const result = hasDatabaseUrl()
    ? await saveProfessorGradePostgres(getDatabaseClient(), sessionId, user.id, body)
    : saveProfessorGradeDemo(getDemoRepositoryState(), sessionId, user.id, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.value);
}

function isSaveGradeBody(value: unknown): value is SaveProfessorGradeBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<SaveProfessorGradeBody>;
  return (
    typeof body.gradePercent === "number" &&
    Array.isArray(body.comments)
  );
}
