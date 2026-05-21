import { NextResponse } from "next/server.js";
import { forbidden, getAuthenticatedUser, unauthorized } from "@/lib/auth";
import { getDatabaseClient, hasDatabaseUrl } from "@/lib/db";
import { createProfessorAssignmentPostgres, listProfessorAssignmentsPostgres } from "@/lib/postgres-repository";
import { enforceSameOrigin } from "@/lib/request-security";
import { createProfessorAssignmentDemo, getDemoRepositoryState, listProfessorAssignmentsDemo } from "@/lib/server-repository";
import type { CreateProfessorAssignmentBody } from "@/lib/server-boundaries";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();
  if (user.role !== "professor") return forbidden("Only professors can list assignments.");

  const result = hasDatabaseUrl()
    ? await listProfessorAssignmentsPostgres(getDatabaseClient(), user.id)
    : listProfessorAssignmentsDemo(user.id, getDemoRepositoryState());
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.value);
}

export async function POST(request: Request) {
  const blocked = enforceSameOrigin(request, { requireOrigin: true });
  if (blocked) return blocked;
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();
  if (user.role !== "professor") return forbidden("Only professors can create assignments.");

  const body = await request.json().catch(() => null);
  if (!isCreateAssignmentBody(body)) {
    return NextResponse.json({ error: "Invalid assignment request." }, { status: 400 });
  }

  const result = hasDatabaseUrl()
    ? await createProfessorAssignmentPostgres(getDatabaseClient(), user.id, body)
    : createProfessorAssignmentDemo(getDemoRepositoryState(), user.id, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.value, { status: 201 });
}

function isCreateAssignmentBody(value: unknown): value is CreateProfessorAssignmentBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<CreateProfessorAssignmentBody>;

  return (
    typeof body.title === "string" &&
    typeof body.prompt === "string" &&
    (body.classId === undefined || body.classId === null || typeof body.classId === "string") &&
    (body.dueAt === undefined || body.dueAt === null || typeof body.dueAt === "number")
  );
}
