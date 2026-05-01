import assert from "node:assert/strict";
import test from "node:test";

import { rateLimit } from "../lib/rate-limit.ts";

test("rateLimit returns 429 after the configured request limit", async () => {
  const request = new Request("http://localhost/api/auth/login", {
    headers: { "x-forwarded-for": `203.0.113.${Date.now()}` }
  });

  assert.equal(rateLimit(request, "test-scope", { limit: 2, windowMs: 60_000 }), null);
  assert.equal(rateLimit(request, "test-scope", { limit: 2, windowMs: 60_000 }), null);

  const limited = rateLimit(request, "test-scope", { limit: 2, windowMs: 60_000 });
  assert.equal(limited?.status, 429);
  assert.equal(await limited?.json().then((body) => body.error), "Too many requests. Please retry shortly.");
});
