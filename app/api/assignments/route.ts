import { NextResponse } from "next/server.js";
import { forbidden, getAuthenticatedUser, unauthorized } from "@/lib/auth";
import { getDatabaseClient, hasDatabaseUrl } from "@/lib/db";
import { listStudentAssignmentsPostgres } from "@/lib/postgres-repository";
import { getDemoRepositoryState, listStudentAssignmentsDemo } from "@/lib/server-repository";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();
  if (user.role !== "student") return forbidden("Only students can list assignments.");

  const result = hasDatabaseUrl()
    ? await listStudentAssignmentsPostgres(getDatabaseClient(), user.id)
    : listStudentAssignmentsDemo(getDemoRepositoryState(), user.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.value);
}
