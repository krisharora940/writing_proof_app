import { NextResponse } from "next/server.js";
import { forbidden, getAuthenticatedUser, unauthorized } from "@/lib/auth";
import { getDatabaseClient, hasDatabaseUrl } from "@/lib/db";
import { enrollAssignmentStudentPostgres, listAssignmentRosterPostgres } from "@/lib/postgres-repository";
import { enforceSameOrigin } from "@/lib/request-security";
import { enrollAssignmentStudentDemo, getDemoRepositoryState, listAssignmentRosterDemo } from "@/lib/server-repository";
import type { EnrollAssignmentStudentBody } from "@/lib/server-boundaries";

type RouteContext = {
  params: Promise<{ classId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();
  if (user.role !== "professor") return forbidden("Only professors can list class rosters.");

  const { classId } = await context.params;
  const result = hasDatabaseUrl()
    ? await listAssignmentRosterPostgres(getDatabaseClient(), classId, user.id)
    : listAssignmentRosterDemo(getDemoRepositoryState(), classId, user.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.value);
}

export async function POST(request: Request, context: RouteContext) {
  const blocked = enforceSameOrigin(request, { requireOrigin: true });
  if (blocked) return blocked;
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();
  if (user.role !== "professor") return forbidden("Only professors can manage class rosters.");

  const body = await request.json().catch(() => null);
  if (!isEnrollBody(body)) return NextResponse.json({ error: "Invalid enrollment request." }, { status: 400 });

  const { classId } = await context.params;
  const result = hasDatabaseUrl()
    ? await enrollAssignmentStudentPostgres(getDatabaseClient(), classId, user.id, body)
    : enrollAssignmentStudentDemo(getDemoRepositoryState(), classId, user.id, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ student: result.value }, { status: 201 });
}

function isEnrollBody(value: unknown): value is EnrollAssignmentStudentBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<EnrollAssignmentStudentBody>;
  return typeof body.email === "string" && typeof body.displayName === "string";
}
