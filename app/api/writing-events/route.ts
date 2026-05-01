import { NextResponse } from "next/server.js";
import { forbidden, getAuthenticatedUser, unauthorized } from "@/lib/auth";
import { getDatabaseClient, hasDatabaseUrl } from "@/lib/db";
import { appendWritingEventPostgres } from "@/lib/postgres-repository";
import { appendWritingEvent, getDemoRepositoryState } from "@/lib/server-repository";
import type { AppendWritingEventBody } from "@/lib/server-boundaries";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();
  if (user.role !== "student") return forbidden("Only students can append writing events.");

  const body = await request.json().catch(() => null);

  if (!isAppendWritingEventRequest(body)) {
    return NextResponse.json({ error: "Invalid writing event request" }, { status: 400 });
  }

  const writeRequest = {
    ...body,
    studentId: user.id
  };
  const result = hasDatabaseUrl()
    ? await appendWritingEventPostgres(getDatabaseClient(), writeRequest)
    : appendWritingEvent(getDemoRepositoryState(), writeRequest);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.value, { status: 201 });
}

function isAppendWritingEventRequest(value: unknown): value is AppendWritingEventBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<AppendWritingEventBody>;

  return (
    typeof body.sessionId === "string" &&
    !!body.event &&
    typeof body.event === "object" &&
    typeof body.event.type === "string" &&
    typeof body.event.at === "number"
  );
}
