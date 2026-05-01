import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const replayRouteSource = readFileSync(new URL("../app/api/replay/route.ts", import.meta.url), "utf8");
const comparisonRouteSource = readFileSync(new URL("../app/api/summary-comparison/route.ts", import.meta.url), "utf8");

test("frontend hydrates identity and student state from backend session APIs", () => {
  assert.match(pageSource, /\/api\/auth\/me/);
  assert.match(pageSource, /\/api\/assignments\/current/);
  assert.doesNotMatch(pageSource, /DEMO_SESSION_ID/);
  assert.doesNotMatch(pageSource, /studentId/);
  assert.doesNotMatch(pageSource, /professorId/);
  assert.doesNotMatch(pageSource, /localStorage/);
  assert.doesNotMatch(pageSource, /Signed in as/);
  assert.match(pageSource, /id="demo-username"/);
  assert.match(pageSource, /id="demo-password"/);
  assert.match(pageSource, /student-demo/);
  assert.match(pageSource, /professor-demo/);
  assert.match(pageSource, /\/api\/auth\/logout/);
});

test("frontend student writes do not send client-owned identity", () => {
  const mutationSources = [
    "AppendWritingEventBody",
    "LockSubmissionBody",
    "TimedSummaryBody"
  ];

  mutationSources.forEach((typeName) => assert.match(pageSource, new RegExp(typeName)));
  assert.doesNotMatch(pageSource, /studentId\s*:/);
  assert.doesNotMatch(pageSource, /professorId/);
});

test("professor dashboard follows assignment to submission to report flow", () => {
  assert.match(pageSource, /\/api\/professor\/assignments/);
  assert.match(pageSource, /\/api\/assignments\/\$\{encodeURIComponent\(professorState\.selectedAssignmentId\)\}\/submissions/);
  assert.match(pageSource, /\/api\/reports\/\$\{encodeURIComponent\(professorState\.selectedSessionId\)\}/);
  assert.match(pageSource, /\/api\/reports\/\$\{encodeURIComponent\(professorState\.selectedSessionId\)\}\/export\?format=pdf/);
  assert.match(pageSource, /Submitted Paper/);
  assert.match(pageSource, /Comprehension Check/);
});

test("student reset starts a backend-owned new attempt and rehydrates", () => {
  assert.match(pageSource, /New attempt/);
  assert.match(pageSource, /fetch\("\/api\/sessions\/reset",\s*\{\s*method: "POST"\s*\}\)/s);
  assert.match(pageSource, /await hydrateStudent\(\)/);
});

test("student workflow exposes process replay before professor review", () => {
  assert.match(pageSource, /Process Replay/);
  assert.match(pageSource, /student-replay-slider/);
  assert.match(pageSource, /Writing events will appear here as the draft changes/);
});

test("replay and summary comparison load persisted session data", () => {
  assert.match(pageSource, /ReplayRequestBody/);
  assert.match(pageSource, /SummaryComparisonRequestBody/);
  assert.match(pageSource, /JSON\.stringify\(request\)/);
  assert.doesNotMatch(pageSource, /JSON\.stringify\(\{ snapshots: studentState\.snapshots, events: studentState\.events \}\)/);
  assert.match(replayRouteSource, /getReplayPostgres/);
  assert.match(replayRouteSource, /getReplayDemo/);
  assert.doesNotMatch(replayRouteSource, /body\.snapshots/);
  assert.match(comparisonRouteSource, /getSummaryComparisonPostgres/);
  assert.match(comparisonRouteSource, /getSummaryComparisonDemo/);
  assert.doesNotMatch(comparisonRouteSource, /body\.submittedText/);
});
