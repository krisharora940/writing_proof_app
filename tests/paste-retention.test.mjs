import assert from "node:assert/strict";
import test from "node:test";

import { analyzePasteRetention, tokenOverlapRatio, tokenize } from "../lib/paste-retention.ts";

function makeWords(count, prefix = "word") {
  return Array.from({ length: count }, (_, index) => `${prefix}${index}`).join(" ");
}

test("tokenOverlapRatio ignores case and punctuation", () => {
  assert.deepEqual(tokenize("Process-based evidence, isn't final-text detection."), [
    "process",
    "based",
    "evidence",
    "isn't",
    "final",
    "text",
    "detection"
  ]);
  assert.equal(
    tokenOverlapRatio(
      "Process evidence supports fair review.",
      "FAIR review supports process-based evidence!"
    ),
    1
  );
});

test("tokenOverlapRatio respects duplicate token counts", () => {
  assert.equal(
    tokenOverlapRatio(
      "evidence evidence evidence evidence evidence",
      "The final paper mentions evidence once."
    ),
    0.2
  );
});

test("analyzePasteRetention treats small edits as material retention", () => {
  const pasted = makeWords(100);
  const revised = pasted
    .split(" ")
    .filter((_, index) => index >= 10)
    .concat(makeWords(10, "replacement"))
    .join(" ");
  const retention = analyzePasteRetention({
    id: "paste-1",
    type: "paste",
    at: 1000,
    added: pasted,
    addedWords: 100,
    pasteWords: 100
  }, revised);

  assert.equal(retention.overlapRatio, 0.9);
  assert.equal(retention.retainedWordsEstimate, 90);
  assert.equal(retention.materiallyUnchanged, true);
});

test("analyzePasteRetention does not label substantial rewriting as unchanged", () => {
  const pasted = makeWords(100);
  const revised = pasted
    .split(" ")
    .filter((_, index) => index >= 40)
    .concat(makeWords(40, "replacement"))
    .join(" ");
  const retention = analyzePasteRetention({
    id: "paste-1",
    type: "paste",
    at: 1000,
    added: pasted,
    addedWords: 100,
    pasteWords: 100
  }, revised);

  assert.equal(retention.overlapRatio, 0.6);
  assert.equal(retention.retainedWordsEstimate, 60);
  assert.equal(retention.materiallyUnchanged, false);
});
