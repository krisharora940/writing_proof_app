import { NextResponse } from "next/server.js";
import { forbidden, getAuthenticatedUser, unauthorized } from "@/lib/auth";
import { getDatabaseClient, hasDatabaseUrl } from "@/lib/db";
import { joinClassByCodePostgres } from "@/lib/postgres-repository";
import { enforceSameOrigin } from "@/lib/request-security";
import { getDemoRepositoryState, joinClassByCodeDemo } from "@/lib/server-repository";
import type { JoinClassByCodeBody } from "@/lib/server-boundaries";

export async function POST(request: Request) {
  const blocked = enforceSameOrigin(request, { requireOrigin: true });
  if (blocked) return blocked;
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();
  if (user.role !== "student") return forbidden("Only students can join classes.");

  const body = await request.json().catch(() => null);
  if (!isJoinBody(body)) return NextResponse.json({ error: "Invalid class join request." }, { status: 400 });

  const result = hasDatabaseUrl()
    ? await joinClassByCodePostgres(getDatabaseClient(), user.id, body.code)
    : joinClassByCodeDemo(getDemoRepositoryState(), user.id, body.code);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.value);
}

function isJoinBody(value: unknown): value is JoinClassByCodeBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<JoinClassByCodeBody>;
  return typeof body.code === "string";
}
