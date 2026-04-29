import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_USERS,
  DEFAULT_ASSIGNMENT,
  WORKSPACE_STORAGE_KEY,
  canAccessView,
  createDefaultWorkspace,
  getCurrentUser,
  loadWorkspace,
  saveWorkspace
} from "../lib/persistence.ts";

const DEMO_STUDENT_ID = "11111111-1111-4111-8111-111111111111";

function createMemoryStorage(initialValue = null) {
  let value = initialValue;
  return {
    getItem(key) {
      return key === WORKSPACE_STORAGE_KEY ? value : null;
    },
    setItem(key, nextValue) {
      if (key === WORKSPACE_STORAGE_KEY) value = nextValue;
    }
  };
}

test("createDefaultWorkspace provides one assignment and an editable draft submission", () => {
  const workspace = createDefaultWorkspace(1000);

  assert.deepEqual(workspace.assignment, DEFAULT_ASSIGNMENT);
  assert.deepEqual(workspace.users, DEFAULT_USERS);
  assert.equal(getCurrentUser(workspace).role, "student");
  assert.equal(workspace.submission.assignmentId, DEFAULT_ASSIGNMENT.id);
  assert.equal(workspace.submission.paperText, "");
  assert.deepEqual(workspace.submission.snapshots, [{ at: 1000, text: "" }]);
  assert.equal(workspace.submission.submittedAt, null);
});

test("saveWorkspace and loadWorkspace round trip persisted submission state", () => {
  const storage = createMemoryStorage();
  const workspace = createDefaultWorkspace(1000);
  workspace.submission.paperText = "Draft text";
  workspace.submission.submittedText = "Final text";
  workspace.submission.summaryText = "Summary text";
  workspace.submission.submittedAt = 2000;
  workspace.submission.summaryCompletedAt = 3000;

  saveWorkspace(storage, workspace);

  assert.deepEqual(loadWorkspace(storage), workspace);
});

test("loadWorkspace falls back when stored data is missing or invalid", () => {
  assert.equal(loadWorkspace(createMemoryStorage()).assignment.id, DEFAULT_ASSIGNMENT.id);
  assert.equal(loadWorkspace(createMemoryStorage("{bad json")).assignment.id, DEFAULT_ASSIGNMENT.id);
});

test("loadWorkspace normalizes partial stored records", () => {
  const storage = createMemoryStorage(JSON.stringify({
    users: [
      { id: "student-1", name: "Student One", role: "student" },
      { id: "professor-1", name: "Professor One", role: "professor" }
    ],
    currentUserId: "professor-1",
    assignment: { id: "a1", title: "Essay", prompt: "Write." },
    submission: { paperText: "Recovered draft", snapshots: [] }
  }));

  const workspace = loadWorkspace(storage);

  assert.equal(getCurrentUser(workspace).role, "professor");
  assert.equal(workspace.assignment.id, "a1");
  assert.equal(workspace.submission.assignmentId, "a1");
  assert.equal(workspace.submission.paperText, "Recovered draft");
  assert.equal(workspace.submission.summaryText, "");
  assert.equal(workspace.submission.snapshots.length, 1);
});

test("loadWorkspace falls back to demo users when role data is incomplete", () => {
  const storage = createMemoryStorage(JSON.stringify({
    users: [{ id: "student-1", name: "Student One", role: "student" }],
    currentUserId: "missing-user"
  }));

  const workspace = loadWorkspace(storage);

  assert.deepEqual(workspace.users, DEFAULT_USERS);
  assert.equal(getCurrentUser(workspace).id, DEMO_STUDENT_ID);
});

test("loadWorkspace migrates legacy demo ids to database-ready UUIDs", () => {
  const storage = createMemoryStorage(JSON.stringify({
    users: [
      { id: "student-demo", name: "Demo Student", role: "student" },
      { id: "professor-demo", name: "Demo Professor", role: "professor" }
    ],
    currentUserId: "student-demo",
    assignment: { id: "assignment-process-evidence", title: "Essay", prompt: "Write." },
    submission: {
      id: "submission-demo-student",
      studentId: "student-demo",
      paperText: "",
      snapshots: [{ at: 1000, text: "" }]
    }
  }));

  const workspace = loadWorkspace(storage);

  assert.equal(getCurrentUser(workspace).id, DEMO_STUDENT_ID);
  assert.equal(workspace.submission.studentId, DEMO_STUDENT_ID);
});

test("canAccessView keeps student and professor workspaces role-specific", () => {
  const [student, professor] = DEFAULT_USERS;

  assert.equal(canAccessView(student, "student"), true);
  assert.equal(canAccessView(student, "professor"), false);
  assert.equal(canAccessView(professor, "professor"), true);
  assert.equal(canAccessView(professor, "student"), false);
});
