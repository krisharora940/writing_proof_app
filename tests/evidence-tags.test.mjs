import assert from "node:assert/strict";
import test from "node:test";

import {
  generateObservationEvidenceTags,
  generateProcessEvidenceTags,
  generateSummaryEvidenceTags,
  groupEvidenceTags
} from "../lib/evidence-tags.ts";

test("generateProcessEvidenceTags creates neutral factual paste and revision tags", () => {
  const tags = generateProcessEvidenceTags([
    {
      id: "event-1",
      type: "paste",
      at: 1000,
      added: Array.from({ length: 220 }, (_, index) => `word${index}`).join(" "),
      addedWords: 220,
      pasteWords: 220
    }
  ], Array.from({ length: 220 }, (_, index) => `word${index}`).join(" "));

  assert.ok(tags.some((tag) => tag.label === "Large paste event"));
  assert.ok(tags.some((tag) => tag.label === "Text unchanged after paste"));
  assert.ok(tags.every((tag) => !/score|suspicion|cheat/i.test(`${tag.label} ${tag.detail}`)));
});

test("generateSummaryEvidenceTags maps comparison output to grouped evidence tags", () => {
  const tags = generateSummaryEvidenceTags({
    fallbackUsed: false,
    observations: [
      { category: "covered", claim: "Main claim is reflected.", evidence: "claim" },
      { category: "missing", claim: "A major claim is absent.", evidence: "claim" }
    ]
  });
  const grouped = groupEvidenceTags(tags);

  assert.deepEqual(tags.map((tag) => tag.label), ["Strong summary alignment", "Summary omits major claim"]);
  assert.equal(grouped["Summary Alignment"].length, 2);
});

test("generateObservationEvidenceTags attaches tags to report observations", () => {
  const tags = generateObservationEvidenceTags([
    {
      group: "Process",
      title: "Typical process evidence",
      detail: "Writing process events were recorded."
    }
  ]);
  const grouped = groupEvidenceTags(tags);

  assert.equal(tags[0].label, "Typical process evidence");
  assert.equal(tags[0].category, "Report Observation");
  assert.equal(grouped["Report Observation"].length, 1);
});
