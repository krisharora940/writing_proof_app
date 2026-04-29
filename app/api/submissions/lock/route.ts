import { NextResponse } from "next/server";
import { getDatabaseClient, hasDatabaseUrl } from "@/lib/db";
import { lockSubmissionPostgres } from "@/lib/postgres-repository";
import { getDemoRepositoryState, lockSubmission } from "@/lib/server-repository";
import type { LockSubmissionRequest } from "@/lib/server-boundaries";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!isLockSubmissionRequest(body)) {
    return NextResponse.json({ error: "Invalid submission lock request" }, { status: 400 });
  }

  const result = hasDatabaseUrl()
    ? await lockSubmissionPostgres(getDatabaseClient(), body)
    : lockSubmission(getDemoRepositoryState(), body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.value);
}

function isLockSubmissionRequest(value: unknown): value is LockSubmissionRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<LockSubmissionRequest>;

  return (
    typeof body.sessionId === "string" &&
    typeof body.studentId === "string" &&
    typeof body.submittedText === "string" &&
    !!body.snapshot &&
    typeof body.snapshot === "object" &&
    typeof body.snapshot.at === "number" &&
    typeof body.snapshot.text === "string"
  );
}
