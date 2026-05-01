import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server.js";
import { getDatabaseClient, hasDatabaseUrl } from "./db.ts";
import { DEMO_PROFESSOR_ID, DEMO_STUDENT_ID } from "./demo-ids.ts";
import type { QueryClient } from "./postgres-repository.ts";
import type { UserRole } from "./persistence.ts";

export const SESSION_COOKIE = "verified_writing_session";

export type AuthenticatedUser = {
  id: string;
  name: string;
  role: UserRole;
};

export type DemoCredential = {
  username: string;
  password: string;
  userId: string;
};

export type ProviderIdentity = {
  provider: string;
  providerSubject: string;
  email: string;
};

type UserRow = {
  id: string;
  display_name: string;
  role: UserRole;
};

type AuthIdentityRow = UserRow;

const DEMO_CREDENTIALS: DemoCredential[] = [
  { username: "student", password: "student-demo", userId: DEMO_STUDENT_ID },
  { username: "professor", password: "professor-demo", userId: DEMO_PROFESSOR_ID }
];

export function createSessionCookieValue(userId: string) {
  const signature = createHmac("sha256", sessionSecret()).update(userId).digest("base64url");
  return `${userId}.${signature}`;
}

export function readSessionUserId(request: Request) {
  const cookie = request.headers.get("cookie") || "";
  const raw = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);

  return raw ? verifySessionCookieValue(decodeURIComponent(raw)) : null;
}

export async function getAuthenticatedUser(request: Request): Promise<AuthenticatedUser | null> {
  const userId = readSessionUserId(request);
  if (!userId) return null;

  if (!hasDatabaseUrl()) return getDemoAuthenticatedUser(userId);
  return getAuthenticatedUserPostgres(getDatabaseClient(), userId);
}

export async function getAuthenticatedUserPostgres(client: QueryClient, userId: string) {
  const result = await client.query<UserRow>(
    "select id, display_name, role from app_users where id = $1",
    [userId]
  );
  const row = result.rows[0];
  if (!row || (row.role !== "student" && row.role !== "professor")) return null;
  return { id: row.id, name: row.display_name, role: row.role };
}

export async function getAuthenticatedUserForProviderIdentity(
  client: QueryClient,
  identity: ProviderIdentity
) {
  const result = await client.query<AuthIdentityRow>(
    `select app_users.id, app_users.display_name, app_users.role
     from auth_identities
     join app_users on app_users.id = auth_identities.user_id
     where auth_identities.provider = $1 and auth_identities.provider_subject = $2`,
    [identity.provider, identity.providerSubject]
  );
  const row = result.rows[0];
  if (!row || (row.role !== "student" && row.role !== "professor")) return null;
  return { id: row.id, name: row.display_name, role: row.role };
}

export function getDemoAuthenticatedUser(userId: string): AuthenticatedUser | null {
  if (userId === DEMO_STUDENT_ID) return { id: DEMO_STUDENT_ID, name: "Demo Student", role: "student" };
  if (userId === DEMO_PROFESSOR_ID) return { id: DEMO_PROFESSOR_ID, name: "Demo Professor", role: "professor" };
  return null;
}

export function getDemoAuthenticatedUserForCredentials(username: string, password: string): AuthenticatedUser | null {
  const normalizedUsername = username.trim().toLowerCase();
  const credential = DEMO_CREDENTIALS.find((item) => (
    item.username === normalizedUsername && item.password === password
  ));
  return credential ? getDemoAuthenticatedUser(credential.userId) : null;
}

export function getDemoCredentials() {
  return DEMO_CREDENTIALS.map(({ username, password }) => ({ username, password }));
}

export function isDemoLoginAllowed(env: Record<string, string | undefined> = process.env) {
  if (isDeployedEnvironment(env)) return false;
  return env.ALLOW_DEMO_LOGIN === "true" || env.NODE_ENV !== "production";
}

function isDeployedEnvironment(env: Record<string, string | undefined>) {
  return (
    env.VERCEL === "1" ||
    env.RENDER === "true" ||
    env.FLY_APP_NAME !== undefined ||
    env.RAILWAY_ENVIRONMENT !== undefined ||
    env.NETLIFY === "true"
  );
}

export async function verifyProviderToken(request: Request): Promise<ProviderIdentity | null> {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
  const userInfoUrl = process.env.AUTH_PROVIDER_USERINFO_URL;
  if (!token || !userInfoUrl) return null;

  const response = await fetch(userInfoUrl, {
    headers: { authorization: `Bearer ${token}` }
  });
  if (!response.ok) return null;

  const data = await response.json().catch(() => null) as {
    sub?: unknown;
    email?: unknown;
    iss?: unknown;
  } | null;
  if (!data || typeof data.sub !== "string" || typeof data.email !== "string") return null;

  return {
    provider: typeof data.iss === "string" && data.iss ? data.iss : process.env.AUTH_PROVIDER_NAME || "oidc",
    providerSubject: data.sub,
    email: data.email
  };
}

export function unauthorized() {
  return NextResponse.json({ error: "Authentication required." }, { status: 401 });
}

export function forbidden(message = "You are not allowed to access this resource.") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function setSessionCookie(response: NextResponse, userId: string) {
  response.cookies.set(SESSION_COOKIE, createSessionCookieValue(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}

function verifySessionCookieValue(value: string) {
  const [userId, signature] = value.split(".");
  if (!userId || !signature) return null;

  const expected = createSessionCookieValue(userId).split(".")[1];
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return null;
  return timingSafeEqual(actualBuffer, expectedBuffer) ? userId : null;
}

function sessionSecret() {
  if (process.env.AUTH_SESSION_SECRET) return process.env.AUTH_SESSION_SECRET;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SESSION_SECRET is required in production.");
  }
  return "verified-writing-local-dev-session-secret";
}
