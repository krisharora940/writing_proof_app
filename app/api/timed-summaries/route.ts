import { NextResponse } from "next/server";
import { getDatabaseClient, hasDatabaseUrl } from "@/lib/db";
import { storeTimedSummaryPostgres } from "@/lib/postgres-repository";
import { getDemoRepositoryState, storeTimedSummary } from "@/lib/server-repository";
import type { TimedSummaryRequest } from "@/lib/server-boundaries";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!isTimedSummaryRequest(body)) {
    return NextResponse.json({ error: "Invalid timed summary request" }, { status: 400 });
  }

  const result = hasDatabaseUrl()
    ? await storeTimedSummaryPostgres(getDatabaseClient(), body)
    : storeTimedSummary(getDemoRepositoryState(), body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.value, { status: 201 });
}

function isTimedSummaryRequest(value: unknown): value is TimedSummaryRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<TimedSummaryRequest>;

  return (
    typeof body.sessionId === "string" &&
    typeof body.studentId === "string" &&
    typeof body.startedAt === "number" &&
    typeof body.completedAt === "number" &&
    typeof body.summaryText === "string"
  );
}
