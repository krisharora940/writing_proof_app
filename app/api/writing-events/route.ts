import { NextResponse } from "next/server";
import { getDatabaseClient, hasDatabaseUrl } from "@/lib/db";
import { appendWritingEventPostgres } from "@/lib/postgres-repository";
import { appendWritingEvent, getDemoRepositoryState } from "@/lib/server-repository";
import type { AppendWritingEventRequest } from "@/lib/server-boundaries";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!isAppendWritingEventRequest(body)) {
    return NextResponse.json({ error: "Invalid writing event request" }, { status: 400 });
  }

  const result = hasDatabaseUrl()
    ? await appendWritingEventPostgres(getDatabaseClient(), body)
    : appendWritingEvent(getDemoRepositoryState(), body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.value, { status: 201 });
}

function isAppendWritingEventRequest(value: unknown): value is AppendWritingEventRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<AppendWritingEventRequest>;

  return (
    typeof body.sessionId === "string" &&
    typeof body.studentId === "string" &&
    !!body.event &&
    typeof body.event === "object" &&
    typeof body.event.type === "string" &&
    typeof body.event.at === "number"
  );
}
