import { z } from "zod";

/**
 * Contract A — the validated AI output schema for Job Match insights (docs/AI_INSIGHTS.md §3,
 * ADR-035). Pure module (no server-only import) so the UI can share the types and labels and the
 * unit tests can exercise validation without a network.
 *
 * Two representations are kept in sync on purpose:
 *  - `jobMatchResultSchema` (Zod) is the authority. Everything the model returns is re-validated
 *    with it before it is persisted or rendered; invalid output fails the run.
 *  - `JOB_MATCH_JSON_SCHEMA` is sent to Azure OpenAI as a strict structured-output format so the
 *    model is constrained to the shape. Strict mode only supports a subset of JSON Schema, so the
 *    length limits live in Zod and the prompt, not here.
 */

export const JOB_MATCH_CONTRACT_VERSION = "job-match-v1" as const;

export const ASSESSMENT_STATUSES = ["supported", "needs_verification", "not_evidenced"] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export const ASSESSMENT_STATUS_LABELS: Record<AssessmentStatus, string> = {
  supported: "Supported by CV",
  needs_verification: "Needs verification",
  not_evidenced: "Not evidenced in CV",
};

/** Plain-language meaning shown next to each status so "not evidenced" is never read as "lacks". */
export const ASSESSMENT_STATUS_HELP: Record<AssessmentStatus, string> = {
  supported: "The CV contains concrete evidence for this requirement.",
  needs_verification: "Evidence is partial or ambiguous. Confirm it in the interview.",
  not_evidenced:
    "No evidence was found in the provided CV. This is not a sign that the candidate lacks it.",
};

export const ADVISORY_NOTICE =
  "AI output is advisory only. A person reviews it and makes every decision.";

const MAX_ASSESSMENTS = 20;
const MAX_QUESTIONS = 8;

export const jobMatchAssessmentSchema = z.strictObject({
  requirement: z.string().trim().min(1).max(300),
  status: z.enum(ASSESSMENT_STATUSES),
  evidence: z.string().trim().min(1).max(600),
});

export const jobMatchResultSchema = z.strictObject({
  schema_version: z.literal(JOB_MATCH_CONTRACT_VERSION),
  summary: z.string().trim().min(1).max(1200),
  assessments: z.array(jobMatchAssessmentSchema).min(1).max(MAX_ASSESSMENTS),
  interview_questions: z.array(z.string().trim().min(1).max(400)).max(MAX_QUESTIONS),
  advisory_notice: z.string().trim().min(1).max(400),
});

export type JobMatchAssessment = z.infer<typeof jobMatchAssessmentSchema>;
export type JobMatchResult = z.infer<typeof jobMatchResultSchema>;

/**
 * Strict structured-output schema (every property required, no additional properties). Mirrors
 * `jobMatchResultSchema`; `tests/unit/insights-contract.test.ts` checks the two stay aligned.
 */
export const JOB_MATCH_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "summary", "assessments", "interview_questions", "advisory_notice"],
  properties: {
    schema_version: { type: "string", enum: [JOB_MATCH_CONTRACT_VERSION] },
    summary: {
      type: "string",
      description:
        "Two to four concise, evidence-based sentences about how the CV relates to this job. No invented facts, no score, no recommendation.",
    },
    assessments: {
      type: "array",
      description:
        "One entry per genuine requirement taken from the job description (3 to 12 entries).",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["requirement", "status", "evidence"],
        properties: {
          requirement: {
            type: "string",
            description: "A requirement that appears in the job description.",
          },
          status: {
            type: "string",
            enum: [...ASSESSMENT_STATUSES],
            description:
              "supported = concrete evidence in the CV; needs_verification = partial or ambiguous evidence; not_evidenced = no evidence in the CV (never a claim the candidate lacks it).",
          },
          evidence: {
            type: "string",
            description:
              "One or two short sentences quoting or closely paraphrasing the CV, or stating that nothing in the CV addresses the requirement.",
          },
        },
      },
    },
    interview_questions: {
      type: "array",
      description:
        "Up to six questions that target items marked needs_verification or not_evidenced.",
      items: { type: "string" },
    },
    advisory_notice: {
      type: "string",
      description: "A sentence stating that this output is advisory and requires human review.",
    },
  },
} as const;

export type ParsedJobMatchResult =
  { ok: true; result: JobMatchResult } | { ok: false; message: string };

/**
 * Parses and validates model output (a JSON string or an already-parsed value). Never throws;
 * the message is safe to persist and show (it describes the shape problem, not the content).
 */
export function parseJobMatchResult(raw: unknown): ParsedJobMatchResult {
  let value: unknown = raw;
  if (typeof raw === "string") {
    const text = raw.trim();
    if (text.length === 0) {
      return { ok: false, message: "The model returned no output." };
    }
    try {
      value = JSON.parse(text);
    } catch {
      return { ok: false, message: "The model returned output that is not valid JSON." };
    }
  }
  const parsed = jobMatchResultSchema.safeParse(value);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path.length ? ` at ${first.path.map(String).join(".")}` : "";
    return {
      ok: false,
      message: `The model output did not match the ${JOB_MATCH_CONTRACT_VERSION} contract${where}.`,
    };
  }
  return { ok: true, result: parsed.data };
}
