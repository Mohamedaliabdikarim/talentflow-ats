import { z } from "zod";

/**
 * Contract A — the validated AI output schema for Job Match insights (docs/AI_INSIGHTS.md §3 and
 * §8.2, ADR-035/038). Pure module (no server-only import) so the UI can share the types and
 * labels and the unit tests can exercise validation without a network.
 *
 * Two representations are kept in sync on purpose:
 *  - `jobMatchResultSchema` (Zod) is the authority. Everything the model returns is re-validated
 *    with it before it is persisted or rendered; invalid output fails the run.
 *  - `JOB_MATCH_JSON_SCHEMA` is sent to Azure OpenAI as a strict structured-output format so the
 *    model is constrained to the shape. Strict mode only supports a subset of JSON Schema, so the
 *    length limits live in Zod and the prompt, not here.
 *
 * Version 2 attributes every evidence item to a source (`cv` or `github`) with an optional
 * repository link. Stored version-1 results are normalised to the v2 shape on read.
 */

export const JOB_MATCH_CONTRACT_VERSION = "job-match-v2" as const;
export const JOB_MATCH_LEGACY_CONTRACT_VERSION = "job-match-v1" as const;

export const ASSESSMENT_STATUSES = ["supported", "needs_verification", "not_evidenced"] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export const EVIDENCE_SOURCES = ["cv", "github"] as const;
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number];

export const EVIDENCE_SOURCE_LABELS: Record<EvidenceSource, string> = {
  cv: "CV",
  github: "GitHub",
};

export const ASSESSMENT_STATUS_LABELS: Record<AssessmentStatus, string> = {
  supported: "Supported",
  needs_verification: "Needs verification",
  not_evidenced: "Not evidenced",
};

/** Plain-language meaning shown next to each status so "not evidenced" is never read as "lacks". */
export const ASSESSMENT_STATUS_HELP: Record<AssessmentStatus, string> = {
  supported: "The provided material contains concrete evidence for this requirement.",
  needs_verification: "Evidence is partial, indirect or ambiguous. Confirm it in the interview.",
  not_evidenced:
    "No evidence was found in the provided material. This is not a sign that the candidate lacks it.",
};

export const ADVISORY_NOTICE =
  "AI output is advisory only. A person reviews it and makes every decision.";

const MAX_ASSESSMENTS = 20;
const MAX_QUESTIONS = 8;
const MAX_EVIDENCE_ITEMS = 4;

export const evidenceItemSchema = z.strictObject({
  source: z.enum(EVIDENCE_SOURCES),
  text: z.string().trim().min(1).max(600),
  /** For `github` items about one repository: a URL from the list given to the model, else null. */
  repository_url: z.string().trim().max(300).nullable(),
});

export const jobMatchAssessmentSchema = z.strictObject({
  requirement: z.string().trim().min(1).max(300),
  status: z.enum(ASSESSMENT_STATUSES),
  evidence: z.array(evidenceItemSchema).min(1).max(MAX_EVIDENCE_ITEMS),
});

export const jobMatchResultSchema = z.strictObject({
  schema_version: z.literal(JOB_MATCH_CONTRACT_VERSION),
  summary: z.string().trim().min(1).max(1200),
  /** What the provided repositories show that is relevant; empty when no GitHub evidence. */
  github_overview: z.string().trim().max(800),
  assessments: z.array(jobMatchAssessmentSchema).min(1).max(MAX_ASSESSMENTS),
  interview_questions: z.array(z.string().trim().min(1).max(400)).max(MAX_QUESTIONS),
  advisory_notice: z.string().trim().min(1).max(400),
});

export type EvidenceItem = z.infer<typeof evidenceItemSchema>;
export type JobMatchAssessment = z.infer<typeof jobMatchAssessmentSchema>;
export type JobMatchResult = z.infer<typeof jobMatchResultSchema>;

/** Version 1 (CV only, one evidence string per assessment), still accepted for stored rows. */
export const legacyJobMatchResultSchema = z.strictObject({
  schema_version: z.literal(JOB_MATCH_LEGACY_CONTRACT_VERSION),
  summary: z.string().trim().min(1).max(1200),
  assessments: z
    .array(
      z.strictObject({
        requirement: z.string().trim().min(1).max(300),
        status: z.enum(ASSESSMENT_STATUSES),
        evidence: z.string().trim().min(1).max(600),
      }),
    )
    .min(1)
    .max(MAX_ASSESSMENTS),
  interview_questions: z.array(z.string().trim().min(1).max(400)).max(MAX_QUESTIONS),
  advisory_notice: z.string().trim().min(1).max(400),
});

export type LegacyJobMatchResult = z.infer<typeof legacyJobMatchResultSchema>;

/** A v1 result rendered through the v2 shape: every evidence string is one CV item. */
export function normalizeLegacyResult(legacy: LegacyJobMatchResult): JobMatchResult {
  return {
    schema_version: JOB_MATCH_CONTRACT_VERSION,
    summary: legacy.summary,
    github_overview: "",
    assessments: legacy.assessments.map((assessment) => ({
      requirement: assessment.requirement,
      status: assessment.status,
      evidence: [{ source: "cv", text: assessment.evidence, repository_url: null }],
    })),
    interview_questions: legacy.interview_questions,
    advisory_notice: legacy.advisory_notice,
  };
}

/**
 * Strict structured-output schema (every property required, no additional properties). Mirrors
 * `jobMatchResultSchema`; `tests/unit/insights-contract.test.ts` checks the two stay aligned.
 */
export const JOB_MATCH_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "summary",
    "github_overview",
    "assessments",
    "interview_questions",
    "advisory_notice",
  ],
  properties: {
    schema_version: { type: "string", enum: [JOB_MATCH_CONTRACT_VERSION] },
    summary: {
      type: "string",
      description:
        "Two to four concise, evidence-based sentences about how the provided material relates to this job. No invented facts, no score, no recommendation.",
    },
    github_overview: {
      type: "string",
      description:
        "Two or three sentences on what the provided GitHub repositories show that is relevant to this job. An empty string when no <github_profile> block was provided.",
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
              "supported = concrete evidence in the provided material; needs_verification = partial or ambiguous evidence; not_evidenced = no evidence in the provided material (never a claim the candidate lacks it).",
          },
          evidence: {
            type: "array",
            description:
              "One to four evidence items, each attributed to the source it came from. When nothing addresses the requirement, one cv item saying so.",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["source", "text", "repository_url"],
              properties: {
                source: {
                  type: "string",
                  enum: [...EVIDENCE_SOURCES],
                  description:
                    "cv for content from <cv_text>; github only for content from <github_profile>.",
                },
                text: {
                  type: "string",
                  description:
                    "One or two short sentences quoting or closely paraphrasing the source, or stating that nothing in it addresses the requirement.",
                },
                repository_url: {
                  type: ["string", "null"],
                  description:
                    "For a github item about one repository: that repository's url attribute exactly as given. Otherwise null. Never invented.",
                },
              },
            },
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
  { ok: true; result: JobMatchResult; version: string } | { ok: false; message: string };

/**
 * Parses and validates model output or a stored result (a JSON string or an already-parsed
 * value), accepting the current contract and normalising the legacy one. Never throws; the
 * message is safe to persist and show (it describes the shape problem, not the content).
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
  const version =
    value && typeof value === "object" && "schema_version" in value
      ? String((value as { schema_version: unknown }).schema_version)
      : "";
  if (version === JOB_MATCH_LEGACY_CONTRACT_VERSION) {
    const legacy = legacyJobMatchResultSchema.safeParse(value);
    if (!legacy.success) return { ok: false, message: describeFailure(legacy.error, version) };
    return { ok: true, result: normalizeLegacyResult(legacy.data), version };
  }
  const parsed = jobMatchResultSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, message: describeFailure(parsed.error, JOB_MATCH_CONTRACT_VERSION) };
  }
  return { ok: true, result: parsed.data, version: JOB_MATCH_CONTRACT_VERSION };
}

function describeFailure(error: z.ZodError, version: string): string {
  const first = error.issues[0];
  const where = first?.path.length ? ` at ${first.path.map(String).join(".")}` : "";
  return `The model output did not match the ${version} contract${where}.`;
}

export type EvidenceProvenance = {
  /** True when a <github_profile> block was given to the model. */
  githubProvided: boolean;
  /** The repository URLs given to the model; anything else is never rendered as a link. */
  allowedRepositoryUrls: readonly string[];
};

export type ProvenanceOutcome =
  { ok: true; result: JobMatchResult } | { ok: false; message: string };

function canonicalRepositoryUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

/**
 * Server-side provenance rules applied after validation: a GitHub attribution without GitHub
 * evidence is a fabricated source and fails the run; repository links are kept only when they
 * are among the URLs the model was given; CV items never carry a repository link; the GitHub
 * overview is blanked when no GitHub evidence was provided.
 */
export function enforceEvidenceProvenance(
  result: JobMatchResult,
  provenance: EvidenceProvenance,
): ProvenanceOutcome {
  const allowed = new Map(
    provenance.allowedRepositoryUrls.map((url) => [canonicalRepositoryUrl(url), url.trim()]),
  );
  const assessments: JobMatchAssessment[] = [];
  for (const assessment of result.assessments) {
    const evidence: EvidenceItem[] = [];
    for (const item of assessment.evidence) {
      if (item.source === "github") {
        if (!provenance.githubProvided) {
          return {
            ok: false,
            message:
              "The model attributed evidence to GitHub, but no GitHub evidence was provided.",
          };
        }
        const canonical = item.repository_url
          ? allowed.get(canonicalRepositoryUrl(item.repository_url))
          : undefined;
        evidence.push({ ...item, repository_url: canonical ?? null });
      } else {
        evidence.push({ ...item, repository_url: null });
      }
    }
    assessments.push({ ...assessment, evidence });
  }
  return {
    ok: true,
    result: {
      ...result,
      assessments,
      github_overview: provenance.githubProvided ? result.github_overview : "",
    },
  };
}
