import { NextResponse } from "next/server.js";
import { forbidden, getAuthenticatedUser, unauthorized } from "@/lib/auth";
import { getDatabaseClient, hasDatabaseUrl } from "@/lib/db";
import { listProfessorAssignmentsPostgres } from "@/lib/postgres-repository";
import { listProfessorAssignmentsDemo } from "@/lib/server-repository";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();
  if (user.role !== "professor") return forbidden("Only professors can list assignments.");

  const result = hasDatabaseUrl()
    ? await listProfessorAssignmentsPostgres(getDatabaseClient(), user.id)
    : listProfessorAssignmentsDemo(user.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.value);
}
