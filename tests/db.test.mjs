import assert from "node:assert/strict";
import test from "node:test";

import { hasDatabaseUrl } from "../lib/db.ts";

test("hasDatabaseUrl detects configured DATABASE_URL", () => {
  assert.equal(hasDatabaseUrl({ DATABASE_URL: "" }), false);
  assert.equal(hasDatabaseUrl({ DATABASE_URL: "   " }), false);
  assert.equal(hasDatabaseUrl({ DATABASE_URL: "postgres://localhost/app" }), true);
});
