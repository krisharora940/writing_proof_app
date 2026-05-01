import { NextResponse } from "next/server.js";
import { forbidden, getAuthenticatedUser, unauthorized } from "@/lib/auth";
import { getDatabaseClient, hasDatabaseUrl } from "@/lib/db";
import { getSummaryComparisonPostgres } from "@/lib/postgres-repository";
import { getDemoRepositoryState, getSummaryComparisonDemo } from "@/lib/server-repository";
import type { SummaryComparisonRequestBody } from "@/lib/server-boundaries";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();
  if (user.role !== "student" && user.role !== "professor") return forbidden();

  const body = await request.json().catch(() => null);

  if (!isComparisonRequest(body)) {
    return NextResponse.json({ error: "Invalid summary comparison request" }, { status: 400 });
  }

  const result = hasDatabaseUrl()
    ? await getSummaryComparisonPostgres(getDatabaseClient(), body.sessionId, user)
    : getSummaryComparisonDemo(getDemoRepositoryState(), body.sessionId, user);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.value);
}

function isComparisonRequest(value: unknown): value is SummaryComparisonRequestBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<SummaryComparisonRequestBody>;

  return typeof body.sessionId === "string";
}
