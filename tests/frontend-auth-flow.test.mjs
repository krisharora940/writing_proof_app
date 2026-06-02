import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("../components/figma-authorcheck-client.tsx", import.meta.url), "utf8");
const figmaSource = pageSource;
const landingSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const loginSource = readFileSync(new URL("../app/login/page.tsx", import.meta.url), "utf8");
const studentLoginSource = readFileSync(new URL("../app/login/student/page.tsx", import.meta.url), "utf8");
const instructorLoginSource = readFileSync(new URL("../app/login/instructor/page.tsx", import.meta.url), "utf8");
const signupSource = readFileSync(new URL("../app/signup/page.tsx", import.meta.url), "utf8");
const forgotPasswordSource = readFileSync(new URL("../app/forgot-password/page.tsx", import.meta.url), "utf8");
const resetPasswordSource = readFileSync(new URL("../app/reset-password/[token]/page.tsx", import.meta.url), "utf8");
const studentRouteSource = readFileSync(new URL("../app/student/page.tsx", import.meta.url), "utf8");
const professorRouteSource = readFileSync(new URL("../app/professor/page.tsx", import.meta.url), "utf8");
const inviteRouteSource = readFileSync(new URL("../app/invite/[token]/page.tsx", import.meta.url), "utf8");
const assignmentsRouteSource = readFileSync(new URL("../app/api/assignments/route.ts", import.meta.url), "utf8");
const currentAssignmentRouteSource = readFileSync(new URL("../app/api/assignments/current/route.ts", import.meta.url), "utf8");
const replayRouteSource = readFileSync(new URL("../app/api/replay/route.ts", import.meta.url), "utf8");
const metricsRouteSource = readFileSync(new URL("../app/api/sessions/[sessionId]/metrics/route.ts", import.meta.url), "utf8");
const comparisonRouteSource = readFileSync(new URL("../app/api/summary-comparison/route.ts", import.meta.url), "utf8");
const resetRouteSource = readFileSync(new URL("../app/api/sessions/reset/route.ts", import.meta.url), "utf8");

test("app shell exposes public, auth, student, and professor routes", () => {
  assert.match(landingSource, /page="landing"/);
  assert.match(figmaSource, /DraftProof/);
  assert.match(figmaSource, /\/login\/student/);
  assert.match(figmaSource, /\/login\/instructor/);
  assert.match(loginSource, /page="landing"/);
  assert.match(studentLoginSource, /page="login"/);
  assert.match(studentLoginSource, /role="student"/);
  assert.match(instructorLoginSource, /page="login"/);
  assert.match(instructorLoginSource, /role="professor"/);
  assert.match(signupSource, /page="signup"/);
  assert.match(forgotPasswordSource, /page="forgot-password"/);
  assert.match(resetPasswordSource, /page="reset-password"/);
  assert.match(inviteRouteSource, /page="invite"/);
  assert.match(studentRouteSource, /role="student"/);
  assert.match(professorRouteSource, /role="professor"/);
});

test("frontend hydrates identity and student state from backend session APIs", () => {
  assert.match(pageSource, /\/api\/auth\/me/);
  assert.match(pageSource, /\/api\/assignments/);
  assert.match(pageSource, /\/api\/assignments\/current/);
  assert.doesNotMatch(pageSource, /DEMO_SESSION_ID/);
  assert.doesNotMatch(pageSource, /professorId/);
  assert.doesNotMatch(pageSource, /localStorage/);
  assert.doesNotMatch(pageSource, /Signed in as/);
  assert.match(pageSource, /Sign In Required/);
  assert.match(pageSource, /Open \{formatRole\(role\)\} Login/);
  assert.doesNotMatch(pageSource, /Student demo/);
  assert.doesNotMatch(pageSource, /Professor demo/);
  assert.match(pageSource, /\/api\/auth\/logout/);
});

test("signup flow supports email verification resend", () => {
  assert.match(pageSource, /\/api\/auth\/signup\/verify/);
  assert.match(pageSource, /\/api\/auth\/signup\/resend/);
  assert.match(pageSource, /Resend Code/);
  assert.match(pageSource, /no-reply@draftproof\.org/);
});

test("login exposes password reset flow", () => {
  assert.match(pageSource, /Forgot password\?/);
  assert.match(pageSource, /\/forgot-password/);
  assert.match(pageSource, /\/api\/auth\/password-reset/);
  assert.match(pageSource, /\/api\/auth\/password-reset\/\$\{token\}/);
});

test("student dashboard lists assigned work and opens the selected assignment", () => {
  assert.match(pageSource, /Quick Actions/);
  assert.match(pageSource, /Join a Class/);
  assert.match(pageSource, /\/api\/student\/classes\/join/);
  assert.match(pageSource, /Start Assignment/);
  assert.match(pageSource, /StudentAssignmentListResponse/);
  assert.match(pageSource, /router\.push\(`\/student\/assignment\/\$\{assignment\.id\}`\)/);
  assert.match(pageSource, /assignmentId \? `\?assignmentId=\$\{encodeURIComponent\(assignmentId\)\}`/);
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
  assert.match(pageSource, /\/api\/professor\/classes/);
  assert.match(pageSource, /\/api\/assignments\/\$\{selectedAssignmentId\}\/submissions/);
  assert.match(pageSource, /\/api\/reports\/\$\{submission\.sessionId\}/);
  assert.match(pageSource, /\/api\/reports\/\$\{sessionId\}\/grade/);
  assert.match(pageSource, /\/api\/professor\/classes\/\$\{assignmentId\}\/invitations/);
  assert.match(pageSource, /\/api\/class-invitations\/accept/);
  assert.match(pageSource, /Create Assignment/);
  assert.match(pageSource, /Create Class/);
  assert.match(pageSource, /Invite Students/);
  assert.match(pageSource, /Copy Join Code/);
  assert.match(pageSource, /Student Submission/);
  assert.match(pageSource, /Comprehension Summary/);
});

test("student workflow does not expose new attempts", () => {
  assert.doesNotMatch(pageSource, /New attempt/);
  assert.doesNotMatch(pageSource, /ResetSessionBody/);
  assert.doesNotMatch(pageSource, /\/api\/sessions\/reset/);
  assert.match(resetRouteSource, /status: 410/);
  assert.match(resetRouteSource, /New attempts are disabled/);
});

test("professor review exposes evidence and grading before dashboard completion", () => {
  assert.match(pageSource, /DraftProof report and grading workspace/);
  assert.match(pageSource, /Final Grade/);
  assert.match(pageSource, /Save Grade/);
  assert.match(pageSource, /gradePercent/);
});

test("replay and summary comparison APIs load persisted session data", () => {
  assert.match(replayRouteSource, /getReplayPostgres/);
  assert.match(replayRouteSource, /getReplayDemo/);
  assert.doesNotMatch(replayRouteSource, /body\.snapshots/);
  assert.match(metricsRouteSource, /getSessionMetricsPostgres/);
  assert.match(metricsRouteSource, /getSessionMetricsDemo/);
  assert.match(comparisonRouteSource, /getSummaryComparisonPostgres/);
  assert.match(comparisonRouteSource, /getSummaryComparisonDemo/);
  assert.doesNotMatch(comparisonRouteSource, /body\.submittedText/);
});
