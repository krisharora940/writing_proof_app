import { NextResponse } from "next/server.js";
import { createCredentialUser, setSessionCookie } from "@/lib/auth";
import { getDatabaseClient, hasDatabaseUrl } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import type { SignupBody } from "@/lib/server-boundaries";

export async function POST(request: Request) {
  const limited = rateLimit(request, "auth-signup", { limit: 10, windowMs: 60_000 });
  if (limited) return limited;
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: "Signup requires a configured production database." }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  if (!isSignupBody(body)) return NextResponse.json({ error: "Invalid signup request." }, { status: 400 });

  const result = await createCredentialUser(getDatabaseClient(), {
    displayName: body.displayName,
    email: body.email,
    password: body.password,
    role: body.role,
    inviteCode: body.inviteCode
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const response = NextResponse.json({ user: result.user }, { status: 201 });
  setSessionCookie(response, result.user.id);
  return response;
}

function isSignupBody(value: unknown): value is SignupBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<SignupBody>;
  return (
    typeof body.displayName === "string" &&
    typeof body.email === "string" &&
    typeof body.password === "string" &&
    (body.role === "student" || body.role === "professor") &&
    (body.inviteCode === undefined || typeof body.inviteCode === "string")
  );
}
