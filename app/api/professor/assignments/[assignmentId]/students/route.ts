import { NextResponse } from "next/server.js";
import { forbidden, getAuthenticatedUser, unauthorized } from "@/lib/auth";
import { getDatabaseClient, hasDatabaseUrl } from "@/lib/db";
import {
  enrollAssignmentStudentPostgres,
  listAssignmentRosterPostgres,
  removeAssignmentStudentPostgres
} from "@/lib/postgres-repository";
import {
  enrollAssignmentStudentDemo,
  getDemoRepositoryState,
  listAssignmentRosterDemo,
  removeAssignmentStudentDemo
} from "@/lib/server-repository";
import type { EnrollAssignmentStudentBody, RemoveAssignmentStudentBody } from "@/lib/server-boundaries";

type RouteContext = {
  params: Promise<{ assignmentId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();
  if (user.role !== "professor") return forbidden("Only professors can list rosters.");

  const { assignmentId } = await context.params;
  const result = hasDatabaseUrl()
    ? await listAssignmentRosterPostgres(getDatabaseClient(), assignmentId, user.id)
    : listAssignmentRosterDemo(getDemoRepositoryState(), assignmentId, user.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.value);
}

export async function POST(request: Request, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();
  if (user.role !== "professor") return forbidden("Only professors can manage rosters.");

  const body = await request.json().catch(() => null);
  if (!isEnrollBody(body)) return NextResponse.json({ error: "Invalid enrollment request." }, { status: 400 });

  const { assignmentId } = await context.params;
  const result = hasDatabaseUrl()
    ? await enrollAssignmentStudentPostgres(getDatabaseClient(), assignmentId, user.id, body)
    : enrollAssignmentStudentDemo(getDemoRepositoryState(), assignmentId, user.id, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ student: result.value }, { status: 201 });
}

export async function DELETE(request: Request, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();
  if (user.role !== "professor") return forbidden("Only professors can manage rosters.");

  const body = await request.json().catch(() => null);
  if (!isRemoveBody(body)) return NextResponse.json({ error: "Invalid roster removal request." }, { status: 400 });

  const { assignmentId } = await context.params;
  const result = hasDatabaseUrl()
    ? await removeAssignmentStudentPostgres(getDatabaseClient(), assignmentId, user.id, body)
    : removeAssignmentStudentDemo(getDemoRepositoryState(), assignmentId, user.id, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.value);
}

function isEnrollBody(value: unknown): value is EnrollAssignmentStudentBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<EnrollAssignmentStudentBody>;
  return typeof body.email === "string" && typeof body.displayName === "string";
}

function isRemoveBody(value: unknown): value is RemoveAssignmentStudentBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<RemoveAssignmentStudentBody>;
  return typeof body.studentId === "string";
}
