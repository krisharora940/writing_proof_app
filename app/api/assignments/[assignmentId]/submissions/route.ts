import { NextResponse } from "next/server.js";
import { forbidden, getAuthenticatedUser, unauthorized } from "@/lib/auth";
import { getDatabaseClient, hasDatabaseUrl } from "@/lib/db";
import { listAssignmentSubmissionsPostgres } from "@/lib/postgres-repository";
import { getDemoRepositoryState, listAssignmentSubmissionsDemo } from "@/lib/server-repository";

type RouteContext = {
  params: Promise<{ assignmentId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();
  if (user.role !== "professor") return forbidden("Only professors can list submissions.");

  const { assignmentId } = await context.params;
  const result = hasDatabaseUrl()
    ? await listAssignmentSubmissionsPostgres(getDatabaseClient(), assignmentId, user.id)
    : listAssignmentSubmissionsDemo(getDemoRepositoryState(), assignmentId, user.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.value);
}
