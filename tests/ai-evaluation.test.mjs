import assert from "node:assert/strict";
import test from "node:test";

import { evaluateSummaryComparison, writeAiEvaluationLog } from "../lib/ai-evaluation.ts";

function createMockClient() {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      return { rows: [] };
    }
  };
}

test("evaluateSummaryComparison keeps deterministic fallback when no model key is configured", async () => {
  const result = await evaluateSummaryComparison(
    "session-1",
    "Process evidence supports revision and fair review.",
    "Process evidence and revision were discussed.",
    {}
  );

  assert.equal(result.comparison.fallbackUsed, true);
  assert.equal(result.audit.provider, "deterministic");
  assert.equal(result.audit.fallbackUsed, true);
  assert.equal(result.audit.inputHash.length, 64);
  assert.equal(result.audit.requestJson.submittedTextLength, "Process evidence supports revision and fair review.".length);
});

test("evaluateSummaryComparison validates model JSON before accepting it", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{
      message: {
        content: JSON.stringify({
          observations: [{
            category: "covered",
            claim: "The timed summary mentions key process evidence.",
            evidence: "process evidence"
          }]
        })
      }
    }],
    usage: { total_tokens: 123 }
  }), { status: 200, headers: { "content-type": "application/json" } });

  try {
    const result = await evaluateSummaryComparison(
      "session-1",
      "Process evidence supports revision and fair review.",
      "Process evidence and revision were discussed.",
      { OPENAI_API_KEY: "test-key", AI_EVALUATION_MODEL: "test-model" }
    );

    assert.equal(result.comparison.fallbackUsed, false);
    assert.equal(result.audit.provider, "openai");
    assert.equal(result.audit.model, "test-model");
    assert.equal(result.audit.fallbackUsed, false);
    assert.deepEqual(result.audit.tokenUsage, { total_tokens: 123 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("evaluateSummaryComparison falls back when model output violates schema", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ observations: [{ category: "covered", claim: "AI generated", evidence: "bad" }] }) } }]
  }), { status: 200, headers: { "content-type": "application/json" } });

  try {
    const result = await evaluateSummaryComparison(
      "session-1",
      "Process evidence supports revision and fair review.",
      "Process evidence and revision were discussed.",
      { OPENAI_API_KEY: "test-key" }
    );

    assert.equal(result.comparison.fallbackUsed, true);
    assert.equal(result.audit.fallbackUsed, true);
    assert.match(String(result.audit.responseJson.error), /schema/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("writeAiEvaluationLog stores schema metadata and hashes", async () => {
  const client = createMockClient();
  const { audit } = await evaluateSummaryComparison("session-1", "Paper text", "Summary text", {});

  await writeAiEvaluationLog(client, "session-1", "report-1", audit);

  assert.equal(client.calls.length, 1);
  assert.match(client.calls[0].sql, /insert into ai_evaluation_logs/);
  assert.equal(client.calls[0].params[0], "session-1");
  assert.equal(client.calls[0].params[1], "report-1");
  assert.equal(client.calls[0].params[6], "summary-comparison.v2");
  assert.equal(client.calls[0].params[9].length, 64);
});
