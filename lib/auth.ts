import { createHmac, randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
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
type CredentialUserRow = UserRow & {
  password_hash: string;
};
type PendingSignupRow = {
  email: string;
  display_name: string;
  role: UserRole;
  password_hash: string;
  invite_code: string | null;
  code_hash: string;
  attempts_remaining: number;
  expires_at: Date | string;
};

type PasswordResetRow = {
  user_id: string;
  email: string;
  display_name: string;
  role: UserRole;
  token_hash: string;
  expires_at: Date | string;
  used_at: Date | string | null;
};

type TransactionalEmailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
  logLabel?: string;
};

const scrypt = promisify(scryptCallback);
const PASSWORD_SCHEME = "scrypt";
const SCRYPT_KEY_LENGTH = 64;

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

export async function getAuthenticatedUserForPassword(
  client: QueryClient,
  email: string,
  password: string
) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !password) return null;

  const result = await client.query<CredentialUserRow>(
    `select app_users.id, app_users.display_name, app_users.role, auth_credentials.password_hash
     from auth_credentials
     join app_users on app_users.id = auth_credentials.user_id
     where auth_credentials.email = $1`,
    [normalizedEmail]
  );
  const row = result.rows[0];
  if (!row || (row.role !== "student" && row.role !== "professor")) return null;
  const valid = await verifyPassword(password, row.password_hash);
  return valid ? { id: row.id, name: row.display_name, role: row.role } : null;
}

export type SignupInput = {
  displayName: string;
  email: string;
  password: string;
  role: UserRole;
  inviteCode?: string;
};

export type SignupResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; status: number; error: string };

export type SignupVerificationRequestResult =
  | { ok: true; delivery: "email" | "development"; expiresInMinutes: number; code?: string }
  | { ok: false; status: number; error: string };

export type SignupVerificationConfirmInput = {
  email: string;
  code: string;
};

export type SignupVerificationResendResult =
  | { ok: true; delivery: "email" | "development"; expiresInMinutes: number; code?: string }
  | { ok: false; status: number; error: string };

export type PasswordResetRequestResult =
  | { ok: true; delivery: "email" | "development"; expiresInMinutes: number; token?: string }
  | { ok: false; status: number; error: string };

export async function createCredentialUser(client: QueryClient, input: SignupInput): Promise<SignupResult> {
  const displayName = input.displayName.trim();
  const email = normalizeEmail(input.email);
  const passwordError = validatePassword(input.password);

  if (!displayName) return { ok: false, status: 400, error: "Name is required." };
  if (!email) return { ok: false, status: 400, error: "A valid email is required." };
  if (input.role !== "student" && input.role !== "professor") {
    return { ok: false, status: 400, error: "Role must be student or professor." };
  }
  if (passwordError) return { ok: false, status: 400, error: passwordError };
  if (!canCreateRole(input.role, input.inviteCode)) {
    return { ok: false, status: 403, error: "A valid invite is required for this role." };
  }

  const passwordHash = await hashPassword(input.password);
  return createCredentialUserWithPasswordHash(client, {
    displayName,
    email,
    passwordHash,
    role: input.role
  });
}

export async function createSignupVerification(
  client: QueryClient,
  input: SignupInput
): Promise<SignupVerificationRequestResult> {
  const displayName = input.displayName.trim();
  const email = normalizeEmail(input.email);
  const passwordError = validatePassword(input.password);

  if (!displayName) return { ok: false, status: 400, error: "Name is required." };
  if (!email) return { ok: false, status: 400, error: "A valid email is required." };
  if (input.role !== "student" && input.role !== "professor") {
    return { ok: false, status: 400, error: "Role must be student or professor." };
  }
  if (passwordError) return { ok: false, status: 400, error: passwordError };
  if (!canCreateRole(input.role, input.inviteCode)) {
    return { ok: false, status: 403, error: "A valid invite is required for this role." };
  }

  const existingResult = await client.query<{
    id: string;
    role: UserRole;
    has_credentials: boolean;
  }>(
    `select app_users.id,
            app_users.role,
            exists(select 1 from auth_credentials where auth_credentials.user_id = app_users.id) as has_credentials
     from app_users
     where app_users.email = $1`,
    [email]
  );
  const existingUser = existingResult.rows[0];
  if (existingUser?.has_credentials) {
    return { ok: false, status: 409, error: "An account already exists for this email." };
  }
  if (existingUser && existingUser.role !== input.role) {
    return { ok: false, status: 409, error: "Unable to create account for this email." };
  }

  const passwordHash = await hashPassword(input.password);
  const code = createVerificationCode();
  const codeHash = hashVerificationCode(email, code);
  const expiresInMinutes = 10;

  await client.query(
    `insert into signup_email_verifications (
       email,
       display_name,
       role,
       password_hash,
       invite_code,
       code_hash,
       attempts_remaining,
       expires_at,
       created_at,
       updated_at
     )
     values ($1, $2, $3, $4, $5, $6, 5, now() + interval '10 minutes', now(), now())
     on conflict (email) do update set
       display_name = excluded.display_name,
       role = excluded.role,
       password_hash = excluded.password_hash,
       invite_code = excluded.invite_code,
       code_hash = excluded.code_hash,
       attempts_remaining = 5,
       expires_at = excluded.expires_at,
       verified_at = null,
       created_at = now(),
       updated_at = now()`,
    [email, displayName, input.role, passwordHash, input.inviteCode || null, codeHash]
  );

  const delivery = await sendSignupVerificationEmail(email, code);
  return delivery.ok
    ? { ok: true, delivery: delivery.delivery, expiresInMinutes, code: delivery.code }
    : { ok: false, status: delivery.status, error: delivery.error };
}

export async function consumeSignupVerification(
  client: QueryClient,
  input: SignupVerificationConfirmInput
): Promise<SignupResult> {
  const email = normalizeEmail(input.email);
  const code = input.code.trim();
  if (!email) return { ok: false, status: 400, error: "A valid email is required." };
  if (!/^\d{6}$/.test(code)) return { ok: false, status: 400, error: "Verification code must be 6 digits." };

  await client.query("begin");
  try {
    const pendingResult = await client.query<PendingSignupRow>(
      `select email, display_name, role, password_hash, invite_code, code_hash, attempts_remaining, expires_at
       from signup_email_verifications
       where email = $1
       for update`,
      [email]
    );
    const pending = pendingResult.rows[0];
    if (!pending) {
      await client.query("rollback");
      return { ok: false, status: 404, error: "No signup verification is pending for this email." };
    }

    if (pending.attempts_remaining <= 0 || new Date(pending.expires_at).getTime() <= Date.now()) {
      await client.query("delete from signup_email_verifications where email = $1", [email]);
      await client.query("commit");
      return { ok: false, status: 410, error: "Verification code expired. Request a new code." };
    }

    if (!timingSafeStringEqual(hashVerificationCode(email, code), pending.code_hash)) {
      await client.query(
        `update signup_email_verifications
         set attempts_remaining = attempts_remaining - 1,
             updated_at = now()
         where email = $1`,
        [email]
      );
      await client.query("commit");
      return { ok: false, status: 400, error: "Invalid verification code." };
    }

    if (!canCreateRole(pending.role, pending.invite_code || undefined)) {
      await client.query("rollback");
      return { ok: false, status: 403, error: "A valid invite is required for this role." };
    }

    const created = await createCredentialUserWithPasswordHashInTransaction(client, {
      displayName: pending.display_name,
      email,
      passwordHash: pending.password_hash,
      role: pending.role
    });
    if (!created.ok) {
      await client.query("rollback");
      return created;
    }

    await client.query("delete from signup_email_verifications where email = $1", [email]);
    await client.query("commit");
    return created;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

export async function resendSignupVerification(
  client: QueryClient,
  emailInput: string
): Promise<SignupVerificationResendResult> {
  const email = normalizeEmail(emailInput);
  if (!email) return { ok: false, status: 400, error: "A valid email is required." };

  const result = await client.query<PendingSignupRow>(
    `select email, display_name, role, password_hash, invite_code, code_hash, attempts_remaining, expires_at
     from signup_email_verifications
     where email = $1`,
    [email]
  );
  const pending = result.rows[0];
  if (!pending) {
    return { ok: false, status: 404, error: "No signup verification is pending for this email." };
  }

  const code = createVerificationCode();
  const codeHash = hashVerificationCode(email, code);
  const expiresInMinutes = 10;

  await client.query(
    `update signup_email_verifications
     set code_hash = $2,
         attempts_remaining = 5,
         expires_at = now() + interval '10 minutes',
         updated_at = now()
     where email = $1`,
    [email, codeHash]
  );

  const delivery = await sendSignupVerificationEmail(email, code);
  return delivery.ok
    ? { ok: true, delivery: delivery.delivery, expiresInMinutes, code: delivery.code }
    : { ok: false, status: delivery.status, error: delivery.error };
}

export async function requestPasswordReset(
  client: QueryClient,
  emailInput: string
): Promise<PasswordResetRequestResult> {
  const email = normalizeEmail(emailInput);
  const expiresInMinutes = 60;
  if (!email) {
    return { ok: true, delivery: process.env.NODE_ENV === "production" ? "email" : "development", expiresInMinutes };
  }

  const result = await client.query<{
    user_id: string;
    email: string;
    display_name: string;
    role: UserRole;
  }>(
    `select app_users.id as user_id, app_users.email, app_users.display_name, app_users.role
     from app_users
     join auth_credentials on auth_credentials.user_id = app_users.id
     where app_users.email = $1`,
    [email]
  );
  const user = result.rows[0];
  if (!user || (user.role !== "student" && user.role !== "professor")) {
    return { ok: true, delivery: process.env.NODE_ENV === "production" ? "email" : "development", expiresInMinutes };
  }

  const token = createPasswordResetToken();
  const tokenHash = hashPasswordResetToken(token);
  await client.query(
    `insert into password_reset_tokens (user_id, token_hash, expires_at, used_at, created_at, updated_at)
     values ($1, $2, now() + interval '60 minutes', null, now(), now())
     on conflict (user_id) do update set
       token_hash = excluded.token_hash,
       expires_at = excluded.expires_at,
       used_at = null,
       created_at = now(),
       updated_at = now()`,
    [user.user_id, tokenHash]
  );

  const resetUrl = `${getAppBaseUrl()}/reset-password/${token}`;
  const delivery = await sendTransactionalEmail({
    to: user.email,
    subject: "Reset your DraftProof password",
    text: `Reset your DraftProof password here: ${resetUrl}. This link expires in 60 minutes.`,
    html: `<p>Reset your DraftProof password by clicking the link below.</p><p><a href="${resetUrl}">Reset password</a></p><p>This link expires in 60 minutes.</p>`,
    logLabel: `password reset link for ${user.email}: ${resetUrl}`
  });
  return delivery.ok
    ? { ok: true, delivery: delivery.delivery, expiresInMinutes, token: delivery.delivery === "development" ? token : undefined }
    : { ok: false, status: delivery.status, error: "Unable to send password reset email." };
}

export async function validatePasswordResetToken(client: QueryClient, token: string) {
  const reset = await getPasswordResetRow(client, token);
  if (!reset.ok) return reset;
  return { ok: true as const, user: { email: reset.row.email, name: reset.row.display_name } };
}

export async function resetPasswordWithToken(
  client: QueryClient,
  token: string,
  password: string
): Promise<SignupResult> {
  const passwordError = validatePassword(password);
  if (passwordError) return { ok: false, status: 400, error: passwordError };

  await client.query("begin");
  try {
    const reset = await getPasswordResetRow(client, token, true);
    if (!reset.ok) {
      await client.query("rollback");
      return reset;
    }

    const passwordHash = await hashPassword(password);
    await client.query(
      `update auth_credentials
       set password_hash = $2,
           updated_at = now()
       where user_id = $1`,
      [reset.row.user_id, passwordHash]
    );
    await client.query(
      `update password_reset_tokens
       set used_at = now(),
           updated_at = now()
       where user_id = $1`,
      [reset.row.user_id]
    );
    await client.query("commit");
    return {
      ok: true,
      user: {
        id: reset.row.user_id,
        name: reset.row.display_name,
        role: reset.row.role
      }
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

export async function cleanupExpiredSignupVerifications(client: QueryClient) {
  const result = await client.query<{ deleted_count: string }>(
    `with deleted as (
       delete from signup_email_verifications
       where expires_at <= now()
       returning 1
     )
     select count(*)::text as deleted_count from deleted`
  );
  return Number(result.rows[0]?.deleted_count || 0);
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
  if (env.NODE_ENV === "production" || isDeployedEnvironment(env)) return false;
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

export function normalizeEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : "";
}

export function validatePassword(password: string) {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must include at least 1 uppercase letter, 1 lowercase letter, and 1 number.";
  }
  return "";
}

export function canCreateRole(role: UserRole, inviteCode: string | undefined, env: Record<string, string | undefined> = process.env) {
  if (role === "professor") return env.AUTH_DISABLE_PROFESSOR_SIGNUP !== "true";

  const requiredInvite = env.AUTH_STUDENT_INVITE_CODE;
  if (!requiredInvite) return true;
  return timingSafeStringEqual(inviteCode || "", requiredInvite);
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const key = await scrypt(password, salt, SCRYPT_KEY_LENGTH) as Buffer;
  return `${PASSWORD_SCHEME}$${salt}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [scheme, salt, hash] = storedHash.split("$");
  if (scheme !== PASSWORD_SCHEME || !salt || !hash) return false;

  const expected = Buffer.from(hash, "base64url");
  const actual = await scrypt(password, salt, expected.length) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
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

function timingSafeStringEqual(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function createVerificationCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function createPasswordResetToken() {
  return randomBytes(24).toString("base64url");
}

function hashVerificationCode(email: string, code: string) {
  return createHmac("sha256", verificationSecret())
    .update(`${normalizeEmail(email)}:${code}`)
    .digest("hex");
}

function hashPasswordResetToken(token: string) {
  return createHmac("sha256", passwordResetSecret())
    .update(token)
    .digest("hex");
}

function verificationSecret() {
  return process.env.AUTH_EMAIL_VERIFICATION_SECRET || sessionSecret();
}

function passwordResetSecret() {
  return process.env.AUTH_PASSWORD_RESET_SECRET || verificationSecret();
}

async function sendSignupVerificationEmail(email: string, code: string) {
  const subject = "Your DraftProof verification code";
  const text = `Your DraftProof verification code is ${code}. It expires in 10 minutes.`;
  const result = await sendTransactionalEmail({
    to: email,
    subject,
    text,
    html: `<p>Your DraftProof verification code is <strong>${code}</strong>.</p><p>It expires in 10 minutes.</p>`,
    logLabel: `signup verification code for ${email}: ${code}`
  });
  return result.ok
    ? { ok: true as const, delivery: result.delivery, code: result.delivery === "development" ? code : undefined }
    : { ok: false as const, status: result.status, error: "Unable to send verification email." };
}

export async function sendTransactionalEmail(input: TransactionalEmailInput) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_FROM_EMAIL || process.env.RESEND_FROM_EMAIL;

  if (!resendApiKey || !from) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false as const, status: 503, error: "Email delivery is not configured." };
    }
    if (input.logLabel) console.info(`[auth] ${input.logLabel}`);
    return { ok: true as const, delivery: "development" as const, code: undefined };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${resendApiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html
    })
  });
  if (!response.ok) {
    return { ok: false as const, status: 502, error: "Unable to send email." };
  }

  return { ok: true as const, delivery: "email" as const, code: undefined };
}

async function getPasswordResetRow(client: QueryClient, token: string, lock = false) {
  const result = await client.query<PasswordResetRow>(
    `select
       password_reset_tokens.user_id,
       password_reset_tokens.token_hash,
       password_reset_tokens.expires_at,
       password_reset_tokens.used_at,
       app_users.email,
       app_users.display_name,
       app_users.role
     from password_reset_tokens
     join app_users on app_users.id = password_reset_tokens.user_id
     where password_reset_tokens.token_hash = $1
     ${lock ? "for update" : ""}`,
    [hashPasswordResetToken(token)]
  );
  const row = result.rows[0];
  if (!row) return { ok: false as const, status: 404, error: "Password reset link is invalid." };
  if (row.used_at) return { ok: false as const, status: 410, error: "Password reset link has already been used." };
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return { ok: false as const, status: 410, error: "Password reset link expired. Request a new one." };
  }
  return { ok: true as const, row };
}

export function getAppBaseUrl(env: Record<string, string | undefined> = process.env) {
  const explicit = env.APP_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return "https://www.draftproof.org";
}

async function createCredentialUserWithPasswordHash(
  client: QueryClient,
  input: { displayName: string; email: string; passwordHash: string; role: UserRole }
): Promise<SignupResult> {
  await client.query("begin");
  try {
    const result = await createCredentialUserWithPasswordHashInTransaction(client, input);
    if (!result.ok) {
      await client.query("rollback");
      return result;
    }
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function createCredentialUserWithPasswordHashInTransaction(
  client: QueryClient,
  input: { displayName: string; email: string; passwordHash: string; role: UserRole }
): Promise<SignupResult> {
  const existingResult = await client.query<UserRow>(
    "select id, display_name, role from app_users where email = $1 for update",
    [input.email]
  );
  let user = existingResult.rows[0];
  if (user && user.role !== input.role) {
    return { ok: false, status: 409, error: "Unable to create account for this email." };
  }

  if (!user) {
    const inserted = await client.query<UserRow>(
      `insert into app_users (email, display_name, role)
       values ($1, $2, $3)
       returning id, display_name, role`,
      [input.email, input.displayName, input.role]
    );
    user = inserted.rows[0];
  }

  const credentialResult = await client.query<{ user_id: string }>(
    `insert into auth_credentials (user_id, email, password_hash)
     values ($1, $2, $3)
     on conflict (email) do nothing
     returning user_id`,
    [user.id, input.email, input.passwordHash]
  );
  if (!credentialResult.rows[0]) {
    return { ok: false, status: 409, error: "Unable to create account for this email." };
  }

  return { ok: true, user: { id: user.id, name: user.display_name, role: user.role } };
}

function sessionSecret() {
  if (process.env.AUTH_SESSION_SECRET) return process.env.AUTH_SESSION_SECRET;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SESSION_SECRET is required in production.");
  }
  return "verified-writing-local-dev-session-secret";
}
