import { NextResponse } from "next/server.js";
import { getDatabaseClient, hasDatabaseUrl } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { requestPasswordReset } from "@/lib/auth";
import { enforceSameOrigin } from "@/lib/request-security";
import type { PasswordResetRequestBody } from "@/lib/server-boundaries";

export async function POST(request: Request) {
  const blocked = enforceSameOrigin(request, { requireOrigin: true });
  if (blocked) return blocked;
  const limited = rateLimit(request, "auth-password-reset", { limit: 5, windowMs: 10 * 60_000 });
  if (limited) return limited;
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: "Password reset requires a configured production database." }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  if (!isResetBody(body)) return NextResponse.json({ error: "Invalid password reset request." }, { status: 400 });

  const result = await requestPasswordReset(getDatabaseClient(), body.email);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({
    ok: true,
    delivery: result.delivery,
    expiresInMinutes: result.expiresInMinutes,
    token: result.token
  }, { status: 202 });
}

function isResetBody(value: unknown): value is PasswordResetRequestBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<PasswordResetRequestBody>;
  return typeof body.email === "string";
}
