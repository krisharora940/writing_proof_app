import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { enforceSameOrigin, hasRequiredProductionEnv } from "../lib/request-security.ts";

test("enforceSameOrigin accepts same-origin requests and blocks cross-site requests", () => {
  const allowed = enforceSameOrigin(new Request("https://app.example.com/api/demo", {
    method: "POST",
    headers: {
      origin: "https://app.example.com",
      host: "app.example.com"
    }
  }), { requireOrigin: true });
  assert.equal(allowed, null);

  const blocked = enforceSameOrigin(new Request("https://app.example.com/api/demo", {
    method: "POST",
    headers: {
      origin: "https://evil.example.com",
      host: "app.example.com"
    }
  }), { requireOrigin: true });
  assert.equal(blocked?.status, 403);
});

test("enforceSameOrigin can require an origin header for browser mutations", () => {
  const blocked = enforceSameOrigin(new Request("https://app.example.com/api/demo", {
    method: "POST",
    headers: {
      host: "app.example.com"
    }
  }), { requireOrigin: true });
  assert.equal(blocked?.status, 403);
});

test("hasRequiredProductionEnv reports launch-critical environment variables", () => {
  assert.deepEqual(hasRequiredProductionEnv({
    DATABASE_URL: "postgres://app:pass@db/app",
    AUTH_SESSION_SECRET: "session-secret",
    AUTH_EMAIL_VERIFICATION_SECRET: "verify-secret",
    RESEND_API_KEY: "re_key",
    AUTH_FROM_EMAIL: "AuthorCheck <noreply@example.com>"
  }), {
    databaseUrl: true,
    authSessionSecret: true,
    authEmailVerificationSecret: true,
    resendApiKey: true,
    authFromEmail: true
  });
});

test("health and maintenance routes exist for launch operations", () => {
  const healthRoute = readFileSync(new URL("../app/api/health/route.ts", import.meta.url), "utf8");
  const cleanupRoute = readFileSync(new URL("../app/api/internal/maintenance/signup-verifications/route.ts", import.meta.url), "utf8");

  assert.match(healthRoute, /hasRequiredProductionEnv/);
  assert.match(healthRoute, /select 1/);
  assert.match(cleanupRoute, /CRON_SECRET/);
  assert.match(cleanupRoute, /cleanupExpiredSignupVerifications/);
});

test("cookie-auth mutation routes enforce same-origin checks", () => {
  const protectedRoutes = [
    "../app/api/auth/logout/route.ts",
    "../app/api/writing-events/route.ts",
    "../app/api/submissions/lock/route.ts",
    "../app/api/timed-summaries/route.ts",
    "../app/api/professor/classes/route.ts",
    "../app/api/professor/classes/[classId]/students/route.ts",
    "../app/api/professor/assignments/route.ts",
    "../app/api/professor/assignments/[assignmentId]/students/route.ts",
    "../app/api/replay/route.ts",
    "../app/api/reports/[sessionId]/grade/route.ts",
    "../app/api/sessions/reset/route.ts",
    "../app/api/summary-comparison/route.ts"
  ];

  protectedRoutes.forEach((path) => {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /enforceSameOrigin/);
    assert.match(source, /requireOrigin:\s*true/);
  });
});
