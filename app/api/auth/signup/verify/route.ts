import { NextResponse } from "next/server.js";
import { consumeSignupVerification, setSessionCookie } from "@/lib/auth";
import { getDatabaseClient, hasDatabaseUrl } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import type { SignupVerifyCodeBody } from "@/lib/server-boundaries";

export async function POST(request: Request) {
  const limited = rateLimit(request, "auth-signup-verify", { limit: 10, windowMs: 10 * 60_000 });
  if (limited) return limited;
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: "Signup requires a configured production database." }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  if (!isVerifyBody(body)) return NextResponse.json({ error: "Invalid verification request." }, { status: 400 });

  const result = await consumeSignupVerification(getDatabaseClient(), body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const response = NextResponse.json({ user: result.user }, { status: 201 });
  setSessionCookie(response, result.user.id);
  return response;
}

function isVerifyBody(value: unknown): value is SignupVerifyCodeBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<SignupVerifyCodeBody>;
  return typeof body.email === "string" && typeof body.code === "string";
}
