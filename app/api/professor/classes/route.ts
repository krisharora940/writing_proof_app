import { NextResponse } from "next/server.js";
import { forbidden, getAuthenticatedUser, unauthorized } from "@/lib/auth";
import { getDatabaseClient, hasDatabaseUrl } from "@/lib/db";
import { createProfessorClassPostgres, listProfessorClassesPostgres } from "@/lib/postgres-repository";
import { createProfessorClassDemo, getDemoRepositoryState, listProfessorClassesDemo } from "@/lib/server-repository";
import type { CreateProfessorClassBody } from "@/lib/server-boundaries";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();
  if (user.role !== "professor") return forbidden("Only professors can list classes.");

  const result = hasDatabaseUrl()
    ? await listProfessorClassesPostgres(getDatabaseClient(), user.id)
    : listProfessorClassesDemo(user.id, getDemoRepositoryState());
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.value);
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();
  if (user.role !== "professor") return forbidden("Only professors can create classes.");

  const body = await request.json().catch(() => null);
  if (!isCreateClassBody(body)) {
    return NextResponse.json({ error: "Invalid class request." }, { status: 400 });
  }

  const result = hasDatabaseUrl()
    ? await createProfessorClassPostgres(getDatabaseClient(), user.id, body)
    : createProfessorClassDemo(getDemoRepositoryState(), user.id, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.value, { status: 201 });
}

function isCreateClassBody(value: unknown): value is CreateProfessorClassBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<CreateProfessorClassBody>;
  return typeof body.name === "string";
}
