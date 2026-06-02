import { NextResponse } from "next/server.js";
import { getDatabaseClient, hasDatabaseUrl } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { enforceSameOrigin } from "@/lib/request-security";
import { resetPasswordWithToken, setSessionCookie, validatePasswordResetToken } from "@/lib/auth";
import type { PasswordResetConfirmBody } from "@/lib/server-boundaries";

type RouteContext = {
  params: Promise<{ token: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: "Password reset requires a configured production database." }, { status: 503 });
  }

  const { token } = await context.params;
  const result = await validatePasswordResetToken(getDatabaseClient(), token);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ ok: true, user: result.user });
}

export async function POST(request: Request, context: RouteContext) {
  const blocked = enforceSameOrigin(request, { requireOrigin: true });
  if (blocked) return blocked;
  const limited = rateLimit(request, "auth-password-reset-confirm", { limit: 10, windowMs: 10 * 60_000 });
  if (limited) return limited;
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: "Password reset requires a configured production database." }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  if (!isResetBody(body)) return NextResponse.json({ error: "Invalid password reset request." }, { status: 400 });

  const { token } = await context.params;
  const result = await resetPasswordWithToken(getDatabaseClient(), token, body.password);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const response = NextResponse.json({ user: result.user }, { status: 200 });
  setSessionCookie(response, result.user.id);
  return response;
}

function isResetBody(value: unknown): value is PasswordResetConfirmBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<PasswordResetConfirmBody>;
  return typeof body.password === "string";
}
