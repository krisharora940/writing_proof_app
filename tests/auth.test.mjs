import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createSessionCookieValue,
  forbidden,
  getDemoAuthenticatedUser,
  getDemoAuthenticatedUserForCredentials,
  isDemoLoginAllowed,
  readSessionUserId,
  SESSION_COOKIE,
  unauthorized
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

test("production demo credential login is rejected unless demo login is explicitly allowed outside deployments", () => {
  assert.equal(isDemoLoginAllowed({ NODE_ENV: "production", ALLOW_DEMO_LOGIN: undefined }), false);
  assert.equal(isDemoLoginAllowed({ NODE_ENV: "production", ALLOW_DEMO_LOGIN: "true" }), true);
  assert.equal(isDemoLoginAllowed({ NODE_ENV: "production", ALLOW_DEMO_LOGIN: "true", VERCEL: "1" }), false);

  const loginRoute = readFileSync(new URL("../app/api/auth/login/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(loginRoute, /userId && isDemoLoginAllowed\(\)/);
  assert.match(loginRoute, /parseDemoCredentials\(body\)/);
  assert.match(loginRoute, /getDemoAuthenticatedUserForCredentials/);
  assert.match(loginRoute, /verifyProviderToken\(request\)/);
  assert.match(loginRoute, /rateLimit\(request, "auth-login"/);
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
