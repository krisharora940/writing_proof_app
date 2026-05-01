import { NextResponse } from "next/server.js";
import { forbidden, getAuthenticatedUser, unauthorized } from "@/lib/auth";
import { getDatabaseClient, hasDatabaseUrl } from "@/lib/db";
import { getReplayPostgres } from "@/lib/postgres-repository";
import { getDemoRepositoryState, getReplayDemo } from "@/lib/server-repository";
import type { ReplayRequestBody } from "@/lib/server-boundaries";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();
  if (user.role !== "student" && user.role !== "professor") return forbidden();

  const body = await request.json().catch(() => null);

  if (!isReplayRequest(body)) {
    return NextResponse.json({ error: "Invalid replay request" }, { status: 400 });
  }

  const result = hasDatabaseUrl()
    ? await getReplayPostgres(getDatabaseClient(), body.sessionId, user)
    : getReplayDemo(getDemoRepositoryState(), body.sessionId, user);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.value);
}

function isReplayRequest(value: unknown): value is ReplayRequestBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<ReplayRequestBody>;

  return typeof body.sessionId === "string";
}
