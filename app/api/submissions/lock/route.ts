import { NextResponse } from "next/server.js";
import { forbidden, getAuthenticatedUser, unauthorized } from "@/lib/auth";
import { getDatabaseClient, hasDatabaseUrl } from "@/lib/db";
import { lockSubmissionPostgres } from "@/lib/postgres-repository";
import { enforceSameOrigin } from "@/lib/request-security";
import { getDemoRepositoryState, lockSubmission } from "@/lib/server-repository";
import type { LockSubmissionBody } from "@/lib/server-boundaries";

export async function POST(request: Request) {
  const blocked = enforceSameOrigin(request, { requireOrigin: true });
  if (blocked) return blocked;
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();
  if (user.role !== "student") return forbidden("Only students can lock submissions.");

  const body = await request.json().catch(() => null);

  if (!isLockSubmissionRequest(body)) {
    return NextResponse.json({ error: "Invalid submission lock request" }, { status: 400 });
  }

  const lockRequest = {
    ...body,
    studentId: user.id
  };
  const result = hasDatabaseUrl()
    ? await lockSubmissionPostgres(getDatabaseClient(), lockRequest)
    : lockSubmission(getDemoRepositoryState(), lockRequest);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.value);
}

function isLockSubmissionRequest(value: unknown): value is LockSubmissionBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<LockSubmissionBody>;

  return (
    typeof body.sessionId === "string" &&
    typeof body.submittedText === "string" &&
    !!body.snapshot &&
    typeof body.snapshot === "object" &&
    typeof body.snapshot.at === "number" &&
    typeof body.snapshot.text === "string"
  );
}
