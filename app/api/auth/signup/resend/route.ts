import { NextResponse } from "next/server.js";
import { resendSignupVerification } from "@/lib/auth";
import { getDatabaseClient, hasDatabaseUrl } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import type { SignupResendCodeBody } from "@/lib/server-boundaries";

export async function POST(request: Request) {
  const limited = rateLimit(request, "auth-signup-resend", { limit: 3, windowMs: 10 * 60_000 });
  if (limited) return limited;
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: "Signup requires a configured production database." }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  if (!isResendBody(body)) return NextResponse.json({ error: "Invalid resend request." }, { status: 400 });

  const result = await resendSignupVerification(getDatabaseClient(), body.email);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({
    ok: true,
    delivery: result.delivery,
    expiresInMinutes: result.expiresInMinutes,
    code: result.code
  }, { status: 202 });
}

function isResendBody(value: unknown): value is SignupResendCodeBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<SignupResendCodeBody>;
  return typeof body.email === "string";
}
