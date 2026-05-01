import { NextResponse } from "next/server.js";
import { forbidden, getAuthenticatedUser, unauthorized } from "@/lib/auth";
import { getDatabaseClient, hasDatabaseUrl } from "@/lib/db";
import { getCurrentStudentSessionPostgres } from "@/lib/postgres-repository";
import { getCurrentStudentSessionDemo, getDemoRepositoryState } from "@/lib/server-repository";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();
  if (user.role !== "student") return forbidden("Only students can load a writing session.");

  const result = hasDatabaseUrl()
    ? await getCurrentStudentSessionPostgres(getDatabaseClient(), user.id)
    : getCurrentStudentSessionDemo(getDemoRepositoryState(), user.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.value);
}
