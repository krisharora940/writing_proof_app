import { NextResponse } from "next/server.js";
import { forbidden, getAuthenticatedUser, unauthorized } from "@/lib/auth";
import { getDatabaseClient, hasDatabaseUrl } from "@/lib/db";
import { acceptClassInvitationPostgres } from "@/lib/postgres-repository";
import { enforceSameOrigin } from "@/lib/request-security";
import { acceptClassInvitationDemo, getDemoRepositoryState } from "@/lib/server-repository";
import type { AcceptClassInvitationBody } from "@/lib/server-boundaries";

export async function POST(request: Request) {
  const blocked = enforceSameOrigin(request, { requireOrigin: true });
  if (blocked) return blocked;
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();
  if (user.role !== "student") return forbidden("Only students can accept class invitations.");

  const body = await request.json().catch(() => null);
  if (!isAcceptBody(body)) return NextResponse.json({ error: "Invalid invitation acceptance request." }, { status: 400 });

  const result = hasDatabaseUrl()
    ? await acceptClassInvitationPostgres(getDatabaseClient(), body.token, user.id)
    : acceptClassInvitationDemo(getDemoRepositoryState(), body.token, user.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.value);
}

function isAcceptBody(value: unknown): value is AcceptClassInvitationBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<AcceptClassInvitationBody>;
  return typeof body.token === "string";
}
