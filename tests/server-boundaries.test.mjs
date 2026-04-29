import assert from "node:assert/strict";
import test from "node:test";

import {
  API_BOUNDARIES,
  canAppendEvent,
  canLockSubmission,
  canStoreTimedSummary
} from "../lib/server-boundaries.ts";

test("API boundaries cover student writes and professor review reads", () => {
  const paths = API_BOUNDARIES.map((boundary) => boundary.path);

  [
    "/api/writing-events",
    "/api/submissions/lock",
    "/api/timed-summaries",
    "/api/replay",
    "/api/summary-comparison",
    "/api/reports/:sessionId"
  ].forEach((path) => {
    assert.ok(paths.includes(path));
  });
});

test("API boundaries use explicit role access", () => {
  assert.ok(API_BOUNDARIES.every((boundary) => (
    boundary.access === "student" ||
    boundary.access === "professor" ||
    boundary.access === "student-or-professor"
  )));
});

test("server-side lock rules reject edits after submission lock", () => {
  assert.equal(canAppendEvent({ lockedAt: null }), true);
  assert.equal(canAppendEvent({ lockedAt: 1000 }), false);
  assert.equal(canLockSubmission({ submittedAt: null, lockedAt: null }), true);
  assert.equal(canLockSubmission({ submittedAt: 1000, lockedAt: 1000 }), false);
});

test("timed summary can be stored only once after submission", () => {
  assert.equal(canStoreTimedSummary({ submittedAt: null }, null), false);
  assert.equal(canStoreTimedSummary({ submittedAt: 1000 }, null), true);
  assert.equal(canStoreTimedSummary({ submittedAt: 1000 }, { id: "summary-1" }), false);
});
