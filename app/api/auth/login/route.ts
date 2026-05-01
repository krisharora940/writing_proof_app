import { NextResponse } from "next/server.js";
import { getDatabaseClient, hasDatabaseUrl } from "@/lib/db";
import {
  getAuthenticatedUserForProviderIdentity,
  getDemoAuthenticatedUserForCredentials,
  isDemoLoginAllowed,
  setSessionCookie,
  verifyProviderToken
} from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const limited = rateLimit(request, "auth-login", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const credentials = parseDemoCredentials(body);
  const client = hasDatabaseUrl() ? getDatabaseClient() : null;

  const providerIdentity = await verifyProviderToken(request);
  const user = providerIdentity && client
    ? await getAuthenticatedUserForProviderIdentity(client, providerIdentity)
    : credentials && isDemoLoginAllowed()
      ? getDemoAuthenticatedUserForCredentials(credentials.username, credentials.password)
      : null;
  if (!user) return NextResponse.json({ error: "Unknown user." }, { status: 401 });

  const response = NextResponse.json({ user });
  setSessionCookie(response, user.id);
  return response;
}

function parseDemoCredentials(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const body = value as { username?: unknown; password?: unknown };
  if (typeof body.username !== "string" || typeof body.password !== "string") return null;
  return { username: body.username, password: body.password };
}
