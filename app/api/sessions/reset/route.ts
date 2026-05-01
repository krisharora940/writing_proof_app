import { NextResponse } from "next/server.js";
import { forbidden, getAuthenticatedUser, unauthorized } from "@/lib/auth";
import { getDatabaseClient, hasDatabaseUrl } from "@/lib/db";
import { resetCurrentStudentSessionPostgres } from "@/lib/postgres-repository";
import { getDemoRepositoryState, resetCurrentStudentSessionDemo } from "@/lib/server-repository";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();
  if (user.role !== "student") return forbidden("Only students can create a new attempt.");

  const result = hasDatabaseUrl()
    ? await resetCurrentStudentSessionPostgres(getDatabaseClient(), user.id)
    : resetCurrentStudentSessionDemo(getDemoRepositoryState(), user.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.value, { status: 201 });
}
