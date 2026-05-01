import { NextResponse } from "next/server.js";
import { getDatabaseClient, hasDatabaseUrl } from "@/lib/db";
import {
  getAuthenticatedUserForPassword,
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
  const credentials = parseCredentials(body);
  const client = hasDatabaseUrl() ? getDatabaseClient() : null;

  const providerIdentity = await verifyProviderToken(request);
  const user = providerIdentity && client
    ? await getAuthenticatedUserForProviderIdentity(client, providerIdentity)
    : credentials?.username && isDemoLoginAllowed()
      ? getDemoAuthenticatedUserForCredentials(credentials.username, credentials.password)
    : credentials && client
      ? await getAuthenticatedUserForPassword(client, credentials.email, credentials.password)
      : null;
  if (!user) return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });

  const response = NextResponse.json({ user });
  setSessionCookie(response, user.id);
  return response;
}

function parseCredentials(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const body = value as { email?: unknown; username?: unknown; password?: unknown };
  if (typeof body.password !== "string") return null;
  if (typeof body.email === "string") return { email: body.email, password: body.password };
  if (typeof body.username === "string") return { email: body.username, username: body.username, password: body.password };
  return null;
}
