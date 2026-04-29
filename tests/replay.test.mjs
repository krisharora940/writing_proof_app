import assert from "node:assert/strict";
import test from "node:test";

import { reconstructReplay } from "../lib/replay.ts";

const at = Date.UTC(2026, 0, 1, 12, 0, 0);

test("reconstructReplay builds frames from an initial snapshot and edit events", () => {
  const frames = reconstructReplay(
    [{ at, text: "" }],
    [
      { id: "1", type: "insert", at: at + 1, start: 0, removed: "", added: "Hello", addedWords: 1 },
      { id: "2", type: "insert", at: at + 2, start: 5, removed: "", added: " world", addedWords: 1 },
      { id: "3", type: "delete", at: at + 3, start: 5, removed: " world", added: "", removedCharacters: 6 },
      { id: "4", type: "submit", at: at + 4, words: 1 }
    ]
  );

  assert.equal(frames.length, 5);
  assert.equal(frames[0].eventType, "start");
  assert.equal(frames[1].text, "Hello");
  assert.equal(frames[2].text, "Hello world");
  assert.equal(frames[3].text, "Hello");
  assert.equal(frames[4].label, "Submitted with 1 words");
});

test("reconstructReplay uses matching snapshots as checkpoint corrections", () => {
  const frames = reconstructReplay(
    [
      { at, text: "" },
      { at: at + 1, text: "Corrected server text" }
    ],
    [{ id: "1", type: "insert", at: at + 1, start: 0, removed: "", added: "Client text", addedWords: 2 }]
  );

  assert.equal(frames[1].text, "Corrected server text");
});

test("reconstructReplay sorts events chronologically", () => {
  const frames = reconstructReplay(
    [{ at, text: "" }],
    [
      { id: "2", type: "insert", at: at + 2, start: 1, removed: "", added: "B", addedWords: 1 },
      { id: "1", type: "insert", at: at + 1, start: 0, removed: "", added: "A", addedWords: 1 }
    ]
  );

  assert.equal(frames[1].eventId, "1");
  assert.equal(frames[2].text, "AB");
});
