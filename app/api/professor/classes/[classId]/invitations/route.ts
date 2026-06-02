import { NextResponse } from "next/server.js";
import { forbidden, getAuthenticatedUser, unauthorized } from "@/lib/auth";
import { getDatabaseClient, hasDatabaseUrl } from "@/lib/db";
import { inviteClassStudentsPostgres } from "@/lib/postgres-repository";
import { enforceSameOrigin } from "@/lib/request-security";
import { getDemoRepositoryState, inviteClassStudentsDemo } from "@/lib/server-repository";
import type { InviteClassStudentsBody } from "@/lib/server-boundaries";

type RouteContext = {
  params: Promise<{ classId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const blocked = enforceSameOrigin(request, { requireOrigin: true });
  if (blocked) return blocked;
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();
  if (user.role !== "professor") return forbidden("Only professors can invite students.");

  const body = await request.json().catch(() => null);
  if (!isInviteBody(body)) return NextResponse.json({ error: "Invalid invitation request." }, { status: 400 });

  const { classId } = await context.params;
  const result = hasDatabaseUrl()
    ? await inviteClassStudentsPostgres(getDatabaseClient(), classId, user.id, body)
    : inviteClassStudentsDemo(getDemoRepositoryState(), classId, user.id, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.value, { status: 201 });
}

function isInviteBody(value: unknown): value is InviteClassStudentsBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<InviteClassStudentsBody>;
  return Array.isArray(body.emails) && body.emails.every((email) => typeof email === "string");
}
