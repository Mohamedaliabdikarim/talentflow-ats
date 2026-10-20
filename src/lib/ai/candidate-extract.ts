import "server-only";
import { generateStructured } from "@/lib/ai/client";
import {
  CANDIDATE_EXTRACT_CONTRACT_VERSION,
  CANDIDATE_EXTRACT_JSON_SCHEMA,
  type CandidatePrefill,
  parseExtraction,
  sanitizeExtractedCandidate,
} from "@/lib/ai/candidate-extract-contract";
import {
  buildCandidateExtractPrompt,
  CANDIDATE_EXTRACT_PROMPT_VERSION,
} from "@/lib/ai/candidate-extract-prompt";
import { InsightRunError } from "@/lib/ai/job-match";

/**
 * CV detail extraction (ADR-039). Server-only. The CV text exists only in memory, is sent to
 * Azure OpenAI once with a strict schema, and the validated, sanitised result is returned to the
 * form; nothing is persisted here and nothing is logged.
 */

const MAX_OUTPUT_TOKENS = 2_500;

export type CandidateExtraction = CandidatePrefill & {
  model: string;
  promptVersion: string;
  contractVersion: string;
};

export async function extractCandidateDetails(
  cvText: string,
  options: { signal?: AbortSignal } = {},
): Promise<CandidateExtraction> {
  if (cvText.trim().length === 0) {
    throw new InsightRunError("The CV has no extractable text (it may be a scanned image).");
  }
  const prompt = buildCandidateExtractPrompt(cvText);
  const response = await generateStructured({
    instructions: prompt.instructions,
    input: prompt.input,
    schemaName: "candidate_profile_extraction",
    jsonSchema: CANDIDATE_EXTRACT_JSON_SCHEMA as unknown as Record<string, unknown>,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    signal: options.signal,
  });
  if (response.incomplete) {
    throw new InsightRunError("The model stopped before finishing the extraction.");
  }
  const parsed = parseExtraction(response.text);
  if (!parsed.ok) throw new InsightRunError(parsed.message);
  const sanitized = sanitizeExtractedCandidate(parsed.raw);
  return {
    ...sanitized,
    model: response.model,
    promptVersion: CANDIDATE_EXTRACT_PROMPT_VERSION,
    contractVersion: CANDIDATE_EXTRACT_CONTRACT_VERSION,
  };
}
