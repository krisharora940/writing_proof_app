import { NextResponse } from "next/server.js";
import { createSignupVerification } from "@/lib/auth";
import { getDatabaseClient, hasDatabaseUrl } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import type { SignupRequestCodeBody } from "@/lib/server-boundaries";

export async function POST(request: Request) {
  const limited = rateLimit(request, "auth-signup", { limit: 5, windowMs: 10 * 60_000 });
  if (limited) return limited;
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: "Signup requires a configured production database." }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  if (!isSignupBody(body)) return NextResponse.json({ error: "Invalid signup request." }, { status: 400 });

  const result = await createSignupVerification(getDatabaseClient(), {
    displayName: body.displayName,
    email: body.email,
    password: body.password,
    role: body.role,
    inviteCode: body.inviteCode
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({
    ok: true,
    delivery: result.delivery,
    expiresInMinutes: result.expiresInMinutes,
    code: result.code
  }, { status: 202 });
}

function isSignupBody(value: unknown): value is SignupRequestCodeBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<SignupRequestCodeBody>;
  return (
    typeof body.displayName === "string" &&
    typeof body.email === "string" &&
    typeof body.password === "string" &&
    (body.role === "student" || body.role === "professor") &&
    (body.inviteCode === undefined || typeof body.inviteCode === "string")
  );
}
