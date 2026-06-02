import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  consumeSignupVerification,
  createSessionCookieValue,
  createCredentialUser,
  createSignupVerification,
  forbidden,
  getDemoAuthenticatedUser,
  getDemoAuthenticatedUserForCredentials,
  getAuthenticatedUserForPassword,
  hashPassword,
  isDemoLoginAllowed,
  requestPasswordReset,
  readSessionUserId,
  resetPasswordWithToken,
  resendSignupVerification,
  SESSION_COOKIE,
  unauthorized,
  validatePasswordResetToken,
  validatePassword,
  verifyPassword
} from "../lib/auth.ts";
import { DEMO_PROFESSOR_ID, DEMO_STUDENT_ID } from "../lib/demo-ids.ts";

test("session cookies are signed and resolved server-side", () => {
  const cookieValue = createSessionCookieValue(DEMO_STUDENT_ID);
  const request = new Request("http://localhost/api/auth/me", {
    headers: { cookie: `${SESSION_COOKIE}=${cookieValue}` }
  });

  assert.equal(readSessionUserId(request), DEMO_STUDENT_ID);
  assert.equal(readSessionUserId(new Request("http://localhost", {
    headers: { cookie: `${SESSION_COOKIE}=${DEMO_STUDENT_ID}.bad-signature` }
  })), null);
});

test("production requires an explicit session secret", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSecret = process.env.AUTH_SESSION_SECRET;
  process.env.NODE_ENV = "production";
  delete process.env.AUTH_SESSION_SECRET;

  assert.throws(() => createSessionCookieValue(DEMO_STUDENT_ID), /AUTH_SESSION_SECRET is required/);

  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalSecret === undefined) delete process.env.AUTH_SESSION_SECRET;
  else process.env.AUTH_SESSION_SECRET = originalSecret;
});

test("production demo credential login is always rejected", () => {
  assert.equal(isDemoLoginAllowed({ NODE_ENV: "production", ALLOW_DEMO_LOGIN: undefined }), false);
  assert.equal(isDemoLoginAllowed({ NODE_ENV: "production", ALLOW_DEMO_LOGIN: "true" }), false);
  assert.equal(isDemoLoginAllowed({ NODE_ENV: "production", ALLOW_DEMO_LOGIN: "true", VERCEL: "1" }), false);
  assert.equal(isDemoLoginAllowed({ NODE_ENV: "development" }), true);

  const loginRoute = readFileSync(new URL("../app/api/auth/login/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(loginRoute, /userId && isDemoLoginAllowed\(\)/);
  assert.match(loginRoute, /parseCredentials\(body\)/);
  assert.match(loginRoute, /getAuthenticatedUserForPassword/);
  assert.match(loginRoute, /getDemoAuthenticatedUserForCredentials/);
  assert.match(loginRoute, /verifyProviderToken\(request\)/);
  assert.match(loginRoute, /rateLimit\(request, "auth-login"/);
});

test("password hashes are salted and verifiable", async () => {
  assert.equal(validatePassword("short"), "Password must be at least 8 characters.");
  assert.equal(
    validatePassword("lowercase1"),
    "Password must include at least 1 uppercase letter, 1 lowercase letter, and 1 number."
  );
  assert.equal(
    validatePassword("UPPERCASE1"),
    "Password must include at least 1 uppercase letter, 1 lowercase letter, and 1 number."
  );
  assert.equal(
    validatePassword("NoNumbers"),
    "Password must include at least 1 uppercase letter, 1 lowercase letter, and 1 number."
  );
  const hash = await hashPassword("WriterPass123");
  assert.match(hash, /^scrypt\$/);
  assert.equal(await verifyPassword("WriterPass123", hash), true);
  assert.equal(await verifyPassword("wrongPass123", hash), false);
});

test("credential signup creates a professor account and password login resolves it", async () => {
  const passwordHash = await hashPassword("teacherPass123");
  const client = {
    calls: [],
    async query(sql, params = []) {
      this.calls.push({ sql, params });
      if (/select id, display_name, role from app_users/.test(sql)) return { rows: [] };
      if (/insert into app_users/.test(sql)) {
        return { rows: [{ id: "professor-1", display_name: "New Professor", role: "professor" }] };
      }
      if (/insert into auth_credentials/.test(sql)) return { rows: [{ user_id: "professor-1" }] };
      if (/from auth_credentials/.test(sql)) {
        return {
          rows: [{
            id: "professor-1",
            display_name: "New Professor",
            role: "professor",
            password_hash: passwordHash
          }]
        };
      }
      return { rows: [] };
    }
  };

  const result = await createCredentialUser(client, {
    displayName: "New Professor",
    email: "Professor@Example.edu",
    password: "teacherPass123",
    role: "professor"
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.user, { id: "professor-1", name: "New Professor", role: "professor" });
  assert.match(client.calls.find((call) => /insert into auth_credentials/.test(call.sql)).params[2], /^scrypt\$/);

  const user = await getAuthenticatedUserForPassword(client, "professor@example.edu", "teacherPass123");
  assert.deepEqual(user, { id: "professor-1", name: "New Professor", role: "professor" });
});

test("signup request stores a pending verification and returns a development code when email delivery is not configured", async () => {
  const client = {
    calls: [],
    async query(sql, params = []) {
      this.calls.push({ sql, params });
      if (/from app_users/.test(sql)) return { rows: [] };
      if (/insert into signup_email_verifications/.test(sql)) return { rows: [] };
      return { rows: [] };
    }
  };

  const result = await createSignupVerification(client, {
    displayName: "New Professor",
    email: "Professor@Example.edu",
    password: "teacherPass123",
    role: "professor"
  });

  assert.equal(result.ok, true);
  assert.equal(result.delivery, "development");
  assert.match(result.code, /^\d{6}$/);
  assert.equal(client.calls.some((call) => /insert into signup_email_verifications/.test(call.sql)), true);
});

test("signup verification consumes the code and creates the account", async () => {
  const passwordHash = await hashPassword("teacherPass123");
  let storedCodeHash = "";
  const client = {
    calls: [],
    async query(sql, params = []) {
      this.calls.push({ sql, params });
      if (/insert into signup_email_verifications/.test(sql)) {
        storedCodeHash = params[5];
        return { rows: [] };
      }
      if (/from signup_email_verifications/.test(sql)) {
        return {
          rows: [{
            email: "professor@example.edu",
            display_name: "New Professor",
            role: "professor",
            password_hash: passwordHash,
            invite_code: null,
            code_hash: storedCodeHash,
            attempts_remaining: 5,
            expires_at: new Date(Date.now() + 60_000)
          }]
        };
      }
      if (/select id, display_name, role from app_users/.test(sql)) return { rows: [] };
      if (/insert into app_users/.test(sql)) {
        return { rows: [{ id: "professor-1", display_name: "New Professor", role: "professor" }] };
      }
      if (/insert into auth_credentials/.test(sql)) return { rows: [{ user_id: "professor-1" }] };
      return { rows: [] };
    }
  };

  const request = await createSignupVerification(client, {
    displayName: "New Professor",
    email: "professor@example.edu",
    password: "teacherPass123",
    role: "professor"
  });

  const result = await consumeSignupVerification(client, {
    email: "professor@example.edu",
    code: request.code
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.user, { id: "professor-1", name: "New Professor", role: "professor" });
});

test("resend signup verification reissues a code for a pending signup", async () => {
  let updatedCodeHash = "";
  const client = {
    async query(sql, params = []) {
      if (/from signup_email_verifications/.test(sql)) {
        return {
          rows: [{
            email: "professor@example.edu",
            display_name: "New Professor",
            role: "professor",
            password_hash: "scrypt$test$hash",
            invite_code: null,
            code_hash: "old-hash",
            attempts_remaining: 2,
            expires_at: new Date(Date.now() + 60_000)
          }]
        };
      }
      if (/update signup_email_verifications/.test(sql)) {
        updatedCodeHash = params[1];
        return { rows: [] };
      }
      return { rows: [] };
    }
  };

  const result = await resendSignupVerification(client, "professor@example.edu");
  assert.equal(result.ok, true);
  assert.equal(result.delivery, "development");
  assert.match(result.code, /^\d{6}$/);
  assert.notEqual(updatedCodeHash, "");
});

test("password reset request stores a token and reset updates the password", async () => {
  let storedTokenHash = "";
  let updatedPasswordHash = "";
  const client = {
    calls: [],
    async query(sql, params = []) {
      this.calls.push({ sql, params });
      if (/from app_users\s+join auth_credentials/.test(sql)) {
        return {
          rows: [{
            user_id: "student-1",
            email: "student@example.edu",
            display_name: "Student One",
            role: "student"
          }]
        };
      }
      if (/insert into password_reset_tokens/.test(sql)) {
        storedTokenHash = params[1];
        return { rows: [] };
      }
      if (/from password_reset_tokens/.test(sql)) {
        return {
          rows: [{
            user_id: "student-1",
            email: "student@example.edu",
            display_name: "Student One",
            role: "student",
            token_hash: storedTokenHash,
            expires_at: new Date(Date.now() + 60_000),
            used_at: null
          }]
        };
      }
      if (/update auth_credentials/.test(sql)) {
        updatedPasswordHash = params[1];
        return { rows: [] };
      }
      return { rows: [] };
    }
  };

  const request = await requestPasswordReset(client, "student@example.edu");
  assert.equal(request.ok, true);
  assert.equal(storedTokenHash.length, 64);
  assert.ok(request.token);

  const validation = await validatePasswordResetToken(client, request.token);
  assert.equal(validation.ok, true);
  assert.equal(validation.user.email, "student@example.edu");

  const result = await resetPasswordWithToken(client, request.token, "WriterPass123");
  assert.equal(result.ok, true);
  assert.equal(result.user.id, "student-1");
  assert.match(updatedPasswordHash, /^scrypt\$/);
});

test("signup verification rejects invalid codes", async () => {
  const passwordHash = await hashPassword("teacherPass123");
  let storedCodeHash = "";
  const client = {
    async query(sql, params = []) {
      if (/insert into signup_email_verifications/.test(sql)) {
        storedCodeHash = params[5];
        return { rows: [] };
      }
      if (/from signup_email_verifications/.test(sql)) {
        return {
          rows: [{
            email: "professor@example.edu",
            display_name: "New Professor",
            role: "professor",
            password_hash: passwordHash,
            invite_code: null,
            code_hash: storedCodeHash,
            attempts_remaining: 5,
            expires_at: new Date(Date.now() + 60_000)
          }]
        };
      }
      return { rows: [] };
    }
  };

  await createSignupVerification(client, {
    displayName: "New Professor",
    email: "professor@example.edu",
    password: "teacherPass123",
    role: "professor"
  });

  const result = await consumeSignupVerification(client, {
    email: "professor@example.edu",
    code: "000000"
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(result.error, "Invalid verification code.");
});

test("signup verification rejects expired codes", async () => {
  const passwordHash = await hashPassword("teacherPass123");
  const client = {
    async query(sql) {
      if (/from signup_email_verifications/.test(sql)) {
        return {
          rows: [{
            email: "professor@example.edu",
            display_name: "New Professor",
            role: "professor",
            password_hash: passwordHash,
            invite_code: null,
            code_hash: "expired-hash",
            attempts_remaining: 5,
            expires_at: new Date(Date.now() - 60_000)
          }]
        };
      }
      return { rows: [] };
    }
  };

  const result = await consumeSignupVerification(client, {
    email: "professor@example.edu",
    code: "123456"
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 410);
  assert.equal(result.error, "Verification code expired. Request a new code.");
});

test("student signup can attach credentials to an invited student account", async () => {
  const client = {
    calls: [],
    async query(sql, params = []) {
      this.calls.push({ sql, params });
      if (/select id, display_name, role from app_users/.test(sql)) {
        return { rows: [{ id: "student-1", display_name: "Invited Student", role: "student" }] };
      }
      if (/insert into auth_credentials/.test(sql)) return { rows: [{ user_id: "student-1" }] };
      return { rows: [] };
    }
  };

  const result = await createCredentialUser(client, {
    displayName: "Invited Student",
    email: "student@example.edu",
    password: "studentPass123",
    role: "student",
    inviteCode: "school-code"
  });

  assert.equal(result.ok, true);
  assert.equal(client.calls.some((call) => /insert into app_users/.test(call.sql)), false);
  assert.equal(client.calls.some((call) => /insert into auth_credentials/.test(call.sql)), true);
});

test("demo auth resolves known users and rejects unknown users", () => {
  assert.deepEqual(getDemoAuthenticatedUser(DEMO_STUDENT_ID), {
    id: DEMO_STUDENT_ID,
    name: "Demo Student",
    role: "student"
  });
  assert.deepEqual(getDemoAuthenticatedUser(DEMO_PROFESSOR_ID), {
    id: DEMO_PROFESSOR_ID,
    name: "Demo Professor",
    role: "professor"
  });
  assert.equal(getDemoAuthenticatedUser("unknown-user"), null);
  assert.equal(getDemoAuthenticatedUserForCredentials("student", "student-demo")?.id, DEMO_STUDENT_ID);
  assert.equal(getDemoAuthenticatedUserForCredentials("professor", "professor-demo")?.id, DEMO_PROFESSOR_ID);
  assert.equal(getDemoAuthenticatedUserForCredentials("student", "wrong"), null);
});

test("auth error helpers preserve 401 and 403 semantics", async () => {
  assert.equal(unauthorized().status, 401);
  assert.equal(forbidden().status, 403);
});

test("protected API routes do not accept request identity as authorization input", () => {
  const writingEventsRoute = readFileSync(new URL("../app/api/writing-events/route.ts", import.meta.url), "utf8");
  const lockRoute = readFileSync(new URL("../app/api/submissions/lock/route.ts", import.meta.url), "utf8");
  const summaryRoute = readFileSync(new URL("../app/api/timed-summaries/route.ts", import.meta.url), "utf8");
  const reportRoute = readFileSync(new URL("../app/api/reports/[sessionId]/route.ts", import.meta.url), "utf8");
  const reportExportRoute = readFileSync(new URL("../app/api/reports/[sessionId]/export/route.ts", import.meta.url), "utf8");

  assert.doesNotMatch(writingEventsRoute, /typeof body\.studentId/);
  assert.doesNotMatch(lockRoute, /typeof body\.studentId/);
  assert.doesNotMatch(summaryRoute, /typeof body\.studentId/);
  assert.doesNotMatch(reportRoute, /searchParams\.get\("professorId"\)/);
  assert.match(writingEventsRoute, /studentId: user\.id/);
  assert.match(lockRoute, /studentId: user\.id/);
  assert.match(summaryRoute, /studentId: user\.id/);
  assert.match(reportRoute, /user\.id/);
  assert.match(reportExportRoute, /user\.id/);
  assert.match(reportRoute, /rateLimit\(request, "report-read"/);
  assert.match(reportExportRoute, /rateLimit\(request, "report-export"/);
});

test("signup route requires verification before account creation", () => {
  const signupRoute = readFileSync(new URL("../app/api/auth/signup/route.ts", import.meta.url), "utf8");
  const verifyRoute = readFileSync(new URL("../app/api/auth/signup/verify/route.ts", import.meta.url), "utf8");
  const resendRoute = readFileSync(new URL("../app/api/auth/signup/resend/route.ts", import.meta.url), "utf8");

  assert.match(signupRoute, /createSignupVerification/);
  assert.match(verifyRoute, /consumeSignupVerification/);
  assert.match(verifyRoute, /setSessionCookie/);
  assert.match(resendRoute, /resendSignupVerification/);
  assert.match(resendRoute, /rateLimit\(request, "auth-signup-resend"/);
});
