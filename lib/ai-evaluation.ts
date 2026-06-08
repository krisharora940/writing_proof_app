import { createHash } from "node:crypto";
import type { QueryClient } from "./postgres-repository.ts";
import { compareSummaryToPaper, validateComparison, type SummaryComparison } from "./summary-comparison.ts";

const SCHEMA_VERSION = "summary-comparison.v2";
const FALLBACK_MODEL = "deterministic-keyword-overlap";

export type EvaluationAudit = {
  provider: string;
  model: string;
  requestJson: Record<string, unknown>;
  responseJson: Record<string, unknown>;
  schemaVersion: string;
  fallbackUsed: boolean;
  promptHash: string | null;
  inputHash: string;
  outputHash: string;
  latencyMs: number;
  tokenUsage: Record<string, unknown> | null;
};

export async function evaluateSummaryComparison(
  sessionId: string,
  submittedText: string,
  summaryText: string,
  env: Record<string, string | undefined> = process.env
): Promise<{ comparison: SummaryComparison; audit: EvaluationAudit }> {
  const startedAt = Date.now();
  const inputHash = sha256(`${submittedText}\n---summary---\n${summaryText}`);
  const prompt = buildPrompt();
  const promptHash = sha256(prompt);

  if (!env.OPENAI_API_KEY) {
    const comparison = compareSummaryToPaper(submittedText, summaryText);
    return {
      comparison,
      audit: createFallbackAudit(sessionId, comparison, submittedText, summaryText, inputHash, Date.now() - startedAt)
    };
  }

  const provider = env.AI_EVALUATION_PROVIDER || "openai";
  const model = env.AI_EVALUATION_MODEL || "gpt-4.1-mini";
  const requestJson = {
    sessionId,
    provider,
    model,
    schemaVersion: SCHEMA_VERSION,
    submittedTextLength: submittedText.length,
    summaryTextLength: summaryText.length
  };

  try {
    const responseJson = await callOpenAIComparison({
      apiKey: env.OPENAI_API_KEY,
      baseUrl: env.OPENAI_BASE_URL,
      model,
      prompt,
      submittedText,
      summaryText
    });
    const comparisonInput = responseJson.comparison && typeof responseJson.comparison === "object"
      ? { ...(responseJson.comparison as Record<string, unknown>), fallbackUsed: false }
      : {};
    const comparison = validateComparison(comparisonInput);
    if (!comparison.observations.length) throw new Error("Model response did not match comparison schema.");

    return {
      comparison,
      audit: {
        provider,
        model,
        requestJson,
        responseJson,
        schemaVersion: SCHEMA_VERSION,
        fallbackUsed: false,
        promptHash,
        inputHash,
        outputHash: sha256(JSON.stringify(responseJson)),
        latencyMs: Date.now() - startedAt,
        tokenUsage: responseJson.tokenUsage
      }
    };
  } catch (error) {
    const comparison = compareSummaryToPaper(submittedText, summaryText);
    return {
      comparison,
      audit: {
        provider,
        model,
        requestJson,
        responseJson: {
          fallbackComparison: comparison,
          error: error instanceof Error ? error.message : "Model evaluation failed."
        },
        schemaVersion: SCHEMA_VERSION,
        fallbackUsed: true,
        promptHash,
        inputHash,
        outputHash: sha256(JSON.stringify(comparison)),
        latencyMs: Date.now() - startedAt,
        tokenUsage: null
      }
    };
  }
}

export async function writeAiEvaluationLog(
  client: QueryClient,
  sessionId: string,
  reportId: string | null,
  audit: EvaluationAudit
) {
  await client.query(
    `insert into ai_evaluation_logs (
       session_id,
       report_id,
       provider,
       model,
       request_json,
       response_json,
       schema_version,
       fallback_used,
       prompt_hash,
       input_hash,
       output_hash,
       latency_ms,
       token_usage
     ) values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11, $12, $13::jsonb)`,
    [
      sessionId,
      reportId,
      audit.provider,
      audit.model,
      JSON.stringify(audit.requestJson),
      JSON.stringify(audit.responseJson),
      audit.schemaVersion,
      audit.fallbackUsed,
      audit.promptHash,
      audit.inputHash,
      audit.outputHash,
      audit.latencyMs,
      audit.tokenUsage ? JSON.stringify(audit.tokenUsage) : null
    ]
  );
}

function createFallbackAudit(
  sessionId: string,
  comparison: SummaryComparison,
  submittedText: string,
  summaryText: string,
  inputHash: string,
  latencyMs: number
): EvaluationAudit {
  return {
    provider: "deterministic",
    model: FALLBACK_MODEL,
    requestJson: {
      sessionId,
      schemaVersion: SCHEMA_VERSION,
      submittedTextLength: submittedText.length,
      summaryTextLength: summaryText.length
    },
    responseJson: { comparison },
    schemaVersion: SCHEMA_VERSION,
    fallbackUsed: true,
    promptHash: null,
    inputHash,
    outputHash: sha256(JSON.stringify(comparison)),
    latencyMs,
    tokenUsage: null
  };
}

async function callOpenAIComparison({
  apiKey,
  baseUrl,
  model,
  prompt,
  submittedText,
  summaryText
}: {
  apiKey: string;
  baseUrl?: string;
  model: string;
  prompt: string;
  submittedText: string;
  summaryText: string;
}): Promise<{ comparison: unknown; tokenUsage: Record<string, unknown> | null }> {
  const response = await fetch(`${baseUrl || "https://api.openai.com/v1"}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt },
        {
          role: "user",
          content: JSON.stringify({
            submittedText,
            summaryText
          })
        }
      ]
    })
  });
  if (!response.ok) throw new Error(`Model request failed with ${response.status}.`);

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: Record<string, unknown>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Model response did not include JSON content.");

  return {
    comparison: JSON.parse(content),
    tokenUsage: data.usage || null
  };
}

function buildPrompt() {
  return [
    "Compare a submitted paper to a student's timed summary.",
    "Return only JSON with an observations array.",
    "Each observation must have category covered, partial, or missing; basis claim; claim; and evidence.",
    "Use neutral process-review wording. Do not mention AI generation, cheating, misconduct, plagiarism, suspicion, or scores.",
    "Limit to six observations."
  ].join(" ");
}

function sha256(text: string) {
  return createHash("sha256").update(text).digest("hex");
}
