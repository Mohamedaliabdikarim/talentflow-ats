import "server-only";
import { extractText } from "unpdf";
import { generateStructured } from "@/lib/ai/client";
import {
  JOB_MATCH_CONTRACT_VERSION,
  JOB_MATCH_JSON_SCHEMA,
  type JobMatchResult,
  parseJobMatchResult,
} from "@/lib/ai/insights-contract";
import {
  buildJobMatchPrompt,
  computeInputHash,
  JOB_MATCH_PROMPT_VERSION,
} from "@/lib/ai/job-match-prompt";

/**
 * Job Match analysis: PDF text extraction and the structured model call (ADR-035). Server-only.
 * CV text exists only in memory here; it is never logged, never persisted, and the caller
 * (src/server/insights/runner.ts) re-checks authorization immediately before calling this.
 */

/** Errors raised by this module carry no document content, so they are safe to persist/show. */
export class InsightRunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsightRunError";
  }
}

/** Reasoning models spend output tokens on reasoning first; leave room for the JSON. */
const MAX_OUTPUT_TOKENS = 6_000;

/** Extracts and normalises the text of a PDF. Empty string when nothing is extractable. */
export async function extractCvText(bytes: Uint8Array): Promise<string> {
  let text: string;
  try {
    const extracted = await extractText(bytes, { mergePages: true });
    text = extracted.text;
  } catch {
    throw new InsightRunError("The CV could not be read as a PDF.");
  }
  return text.replace(/\u0000/g, "").trim();
}

export type JobMatchAnalysis = {
  result: JobMatchResult;
  model: string;
  inputHash: string;
  promptVersion: string;
  contractVersion: string;
};

/**
 * Runs one Job Match request and validates the output against the contract. Throws
 * `AiError` (transport, already sanitised) or `InsightRunError` (content/shape problems).
 */
export async function analyzeJobMatch(params: {
  jobTitle: string;
  jobDescription: string | null | undefined;
  cvText: string;
  signal?: AbortSignal;
}): Promise<JobMatchAnalysis> {
  if (params.cvText.trim().length === 0) {
    throw new InsightRunError("The CV has no extractable text (it may be a scanned image).");
  }
  const prompt = buildJobMatchPrompt(params);
  const response = await generateStructured({
    instructions: prompt.instructions,
    input: prompt.input,
    schemaName: "job_match_insights",
    jsonSchema: JOB_MATCH_JSON_SCHEMA as unknown as Record<string, unknown>,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    signal: params.signal,
  });
  if (response.incomplete) {
    throw new InsightRunError("The model stopped before finishing the assessment.");
  }
  const parsed = parseJobMatchResult(response.text);
  if (!parsed.ok) throw new InsightRunError(parsed.message);
  return {
    result: parsed.result,
    model: response.model,
    inputHash: computeInputHash(prompt.cvText, prompt.jobText, JOB_MATCH_PROMPT_VERSION),
    promptVersion: JOB_MATCH_PROMPT_VERSION,
    contractVersion: JOB_MATCH_CONTRACT_VERSION,
  };
}
