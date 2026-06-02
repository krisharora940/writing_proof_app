import { NextResponse } from "next/server.js";
import { forbidden, getAuthenticatedUser, unauthorized } from "@/lib/auth";
import { getDatabaseClient, hasDatabaseUrl } from "@/lib/db";
import { listAssignmentRosterPostgres, removeClassStudentPostgres } from "@/lib/postgres-repository";
import { enforceSameOrigin } from "@/lib/request-security";
import { getDemoRepositoryState, listAssignmentRosterDemo, removeClassStudentDemo } from "@/lib/server-repository";
import type { RemoveAssignmentStudentBody } from "@/lib/server-boundaries";

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

export async function DELETE(request: Request, context: RouteContext) {
  const blocked = enforceSameOrigin(request, { requireOrigin: true });
  if (blocked) return blocked;
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();
  if (user.role !== "professor") return forbidden("Only professors can manage class rosters.");

  const body = await request.json().catch(() => null);
  if (!isRemoveBody(body)) return NextResponse.json({ error: "Invalid roster removal request." }, { status: 400 });

  const { classId } = await context.params;
  const result = hasDatabaseUrl()
    ? await removeClassStudentPostgres(getDatabaseClient(), classId, user.id, body)
    : removeClassStudentDemo(getDemoRepositoryState(), classId, user.id, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.value);
}

function isRemoveBody(value: unknown): value is RemoveAssignmentStudentBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<RemoveAssignmentStudentBody>;
  return typeof body.studentId === "string";
}
