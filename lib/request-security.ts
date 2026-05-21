import { NextResponse } from "next/server.js";

type SameOriginOptions = {
  requireOrigin?: boolean;
};

export function enforceSameOrigin(request: Request, options: SameOriginOptions = {}) {
  const origin = request.headers.get("origin");
  if (!origin) {
    return options.requireOrigin
      ? NextResponse.json({ error: "Origin header is required." }, { status: 403 })
      : null;
  }

  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  if (!host) {
    return NextResponse.json({ error: "Host header is required." }, { status: 403 });
  }

  const expectedOrigin = `${proto}://${host}`;
  return origin === expectedOrigin
    ? null
    : NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
}

export function hasRequiredProductionEnv(env: Record<string, string | undefined> = process.env) {
  return {
    databaseUrl: hasValue(env.DATABASE_URL),
    authSessionSecret: hasValue(env.AUTH_SESSION_SECRET),
    authEmailVerificationSecret: hasValue(env.AUTH_EMAIL_VERIFICATION_SECRET),
    resendApiKey: hasValue(env.RESEND_API_KEY),
    authFromEmail: hasValue(env.AUTH_FROM_EMAIL || env.RESEND_FROM_EMAIL)
  };
}

function hasValue(value: string | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}
