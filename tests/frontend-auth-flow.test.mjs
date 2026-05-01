import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("../components/workspace-client.tsx", import.meta.url), "utf8");
const landingSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const loginSource = readFileSync(new URL("../app/login/page.tsx", import.meta.url), "utf8");
const signupSource = readFileSync(new URL("../app/signup/page.tsx", import.meta.url), "utf8");
const studentRouteSource = readFileSync(new URL("../app/student/page.tsx", import.meta.url), "utf8");
const professorRouteSource = readFileSync(new URL("../app/professor/page.tsx", import.meta.url), "utf8");
const assignmentsRouteSource = readFileSync(new URL("../app/api/assignments/route.ts", import.meta.url), "utf8");
const currentAssignmentRouteSource = readFileSync(new URL("../app/api/assignments/current/route.ts", import.meta.url), "utf8");
const replayRouteSource = readFileSync(new URL("../app/api/replay/route.ts", import.meta.url), "utf8");
const metricsRouteSource = readFileSync(new URL("../app/api/sessions/[sessionId]/metrics/route.ts", import.meta.url), "utf8");
const comparisonRouteSource = readFileSync(new URL("../app/api/summary-comparison/route.ts", import.meta.url), "utf8");
const resetRouteSource = readFileSync(new URL("../app/api/sessions/reset/route.ts", import.meta.url), "utf8");

test("app shell exposes public, auth, student, and professor routes", () => {
  assert.match(landingSource, /AuthorCheck/);
  assert.match(landingSource, /href="\/login"/);
  assert.match(landingSource, /href="\/signup"/);
  assert.match(loginSource, /mode="login"/);
  assert.match(signupSource, /mode="signup"/);
  assert.match(studentRouteSource, /requiredRole="student"/);
  assert.match(professorRouteSource, /requiredRole="professor"/);
});

test("frontend hydrates identity and student state from backend session APIs", () => {
  assert.match(pageSource, /\/api\/auth\/me/);
  assert.match(pageSource, /\/api\/assignments/);
  assert.match(pageSource, /\/api\/assignments\/current/);
  assert.doesNotMatch(pageSource, /DEMO_SESSION_ID/);
  assert.doesNotMatch(pageSource, /professorId/);
  assert.doesNotMatch(pageSource, /localStorage/);
  assert.doesNotMatch(pageSource, /Signed in as/);
  assert.match(pageSource, /id="workspace-username"/);
  assert.match(pageSource, /id="workspace-password"/);
  assert.doesNotMatch(pageSource, /Student demo/);
  assert.doesNotMatch(pageSource, /Professor demo/);
  assert.doesNotMatch(pageSource, /student-demo/);
  assert.doesNotMatch(pageSource, /professor-demo/);
  assert.match(pageSource, /\/api\/auth\/logout/);
});

test("student dashboard lists assigned work and opens the selected assignment", () => {
  assert.match(pageSource, /Assigned Work/);
  assert.match(pageSource, /Choose Assignment/);
  assert.match(pageSource, /StudentAssignmentListResponse/);
  assert.match(pageSource, /onSelectAssignment\(assignment\.id\)/);
  assert.match(pageSource, /assignmentId=\$\{encodeURIComponent\(assignmentId\)\}/);
  assert.match(assignmentsRouteSource, /listStudentAssignmentsPostgres/);
  assert.match(assignmentsRouteSource, /Only students can list assignments/);
  assert.match(currentAssignmentRouteSource, /searchParams\.get\("assignmentId"\)/);
});

test("frontend student writes do not send client-owned identity", () => {
  const mutationSources = [
    "AppendWritingEventBody",
    "LockSubmissionBody",
    "TimedSummaryBody"
  ];

  mutationSources.forEach((typeName) => assert.match(pageSource, new RegExp(typeName)));
  assert.doesNotMatch(pageSource, /professorId/);
  assert.doesNotMatch(pageSource, /const request: AppendWritingEventBody = \{[^}]*studentId\s*:/s);
  assert.doesNotMatch(pageSource, /const request: LockSubmissionBody = \{[^}]*studentId\s*:/s);
  assert.doesNotMatch(pageSource, /const request: TimedSummaryBody = \{[^}]*studentId\s*:/s);
});

test("professor dashboard follows assignment to submission to report flow", () => {
  assert.match(pageSource, /\/api\/professor\/assignments/);
  assert.match(pageSource, /\/api\/assignments\/\$\{encodeURIComponent\(professorState\.selectedAssignmentId\)\}\/submissions/);
  assert.match(pageSource, /\/api\/reports\/\$\{encodeURIComponent\(professorState\.selectedSessionId\)\}/);
  assert.match(pageSource, /\/api\/reports\/\$\{encodeURIComponent\(professorState\.selectedSessionId\)\}\/export\?format=pdf/);
  assert.match(pageSource, /\/api\/professor\/assignments",\s*\{\s*method: "POST"/);
  assert.match(pageSource, /\/api\/professor\/assignments\/\$\{encodeURIComponent\(professorState\.selectedAssignmentId\)\}\/students/);
  assert.match(pageSource, /Create Assignment/);
  assert.match(pageSource, /Enroll Student/);
  assert.match(pageSource, /id="tag-category"/);
  assert.match(pageSource, /id="tag-sort"/);
  assert.match(pageSource, /sortedEvidenceTags/);
  assert.match(pageSource, /Paste Event Review/);
  assert.match(pageSource, /timelineMarkers\.map/);
  assert.match(pageSource, /pasteEventCards\.map/);
  assert.match(pageSource, /Submitted Paper/);
  assert.match(pageSource, /Comprehension Check/);
});

test("student workflow does not expose new attempts", () => {
  assert.doesNotMatch(pageSource, /New attempt/);
  assert.doesNotMatch(pageSource, /ResetSessionBody/);
  assert.doesNotMatch(pageSource, /\/api\/sessions\/reset/);
  assert.match(resetRouteSource, /status: 410/);
  assert.match(resetRouteSource, /New attempts are disabled/);
});

test("student workflow exposes process replay before professor review", () => {
  assert.match(pageSource, /Process Replay/);
  assert.match(pageSource, /student-replay-slider/);
  assert.match(pageSource, /Writing events will appear here as the draft changes/);
});

test("replay and summary comparison load persisted session data", () => {
  assert.match(pageSource, /ReplayRequestBody/);
  assert.match(pageSource, /SessionMetricsResponse/);
  assert.match(pageSource, /SummaryComparisonRequestBody/);
  assert.match(pageSource, /JSON\.stringify\(request\)/);
  assert.doesNotMatch(pageSource, /JSON\.stringify\(\{ snapshots: studentState\.snapshots, events: studentState\.events \}\)/);
  assert.match(replayRouteSource, /getReplayPostgres/);
  assert.match(replayRouteSource, /getReplayDemo/);
  assert.doesNotMatch(replayRouteSource, /body\.snapshots/);
  assert.match(metricsRouteSource, /getSessionMetricsPostgres/);
  assert.match(metricsRouteSource, /getSessionMetricsDemo/);
  assert.match(pageSource, /\/api\/sessions\/\$\{encodeURIComponent\(sessionId\)\}\/metrics/);
  assert.match(comparisonRouteSource, /getSummaryComparisonPostgres/);
  assert.match(comparisonRouteSource, /getSummaryComparisonDemo/);
  assert.doesNotMatch(comparisonRouteSource, /body\.submittedText/);
});
