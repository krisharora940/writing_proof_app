import { NextResponse } from "next/server.js";
import { forbidden, getAuthenticatedUser, unauthorized } from "@/lib/auth";
import { getDatabaseClient, hasDatabaseUrl } from "@/lib/db";
import { storeTimedSummaryPostgres } from "@/lib/postgres-repository";
import { enforceSameOrigin } from "@/lib/request-security";
import { getDemoRepositoryState, storeTimedSummary } from "@/lib/server-repository";
import type { TimedSummaryBody } from "@/lib/server-boundaries";

export async function POST(request: Request) {
  const blocked = enforceSameOrigin(request, { requireOrigin: true });
  if (blocked) return blocked;
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();
  if (user.role !== "student") return forbidden("Only students can store timed summaries.");

  const body = await request.json().catch(() => null);

  if (!isTimedSummaryRequest(body)) {
    return NextResponse.json({ error: "Invalid timed summary request" }, { status: 400 });
  }

  const summaryRequest = {
    ...body,
    studentId: user.id
  };
  const result = hasDatabaseUrl()
    ? await storeTimedSummaryPostgres(getDatabaseClient(), summaryRequest)
    : storeTimedSummary(getDemoRepositoryState(), summaryRequest);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.value, { status: 201 });
}

function isTimedSummaryRequest(value: unknown): value is TimedSummaryBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<TimedSummaryBody>;

  return (
    typeof body.sessionId === "string" &&
    typeof body.startedAt === "number" &&
    typeof body.completedAt === "number" &&
    typeof body.summaryText === "string"
  );
}
