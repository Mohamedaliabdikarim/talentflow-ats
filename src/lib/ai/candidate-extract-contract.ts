import { z } from "zod";
import { githubUrlSchema, linkedinUrlSchema } from "@/lib/validation/candidate";

/**
 * Contract for CV detail extraction at candidate creation (ADR-039). Pure module.
 *
 * The model may only copy contact and profile details that appear literally in the CV; every
 * field is nullable and absent values stay null. The raw output is validated with Zod, then
 * `sanitizeExtractedCandidate` applies the same rules as the candidate form (lengths, email
 * format, LinkedIn/GitHub profile URL validation) and drops anything that does not pass, with a
 * reviewer-facing warning. Nothing here is persisted: the result only prefills a form that the
 * recruiter reviews and submits.
 */

export const CANDIDATE_EXTRACT_CONTRACT_VERSION = "candidate-profile-extract-v1" as const;

/** Shown by the form when Azure OpenAI is not configured; lives here because a "use server" module may only export async functions. */
export const EXTRACTION_NOT_CONFIGURED_MESSAGE =
  "AI extraction is not configured in this environment. Enter the details manually.";

export const EXTRACTED_FIELDS = [
  "fullName",
  "headline",
  "email",
  "phone",
  "location",
  "linkedinUrl",
  "githubUrl",
] as const;
export type ExtractedField = (typeof EXTRACTED_FIELDS)[number];

export const EXTRACTED_FIELD_LABELS: Record<ExtractedField, string> = {
  fullName: "Full name",
  headline: "Headline",
  email: "Email",
  phone: "Phone",
  location: "Location",
  linkedinUrl: "LinkedIn profile URL",
  githubUrl: "GitHub profile URL",
};

const nullableText = z.string().max(2000).nullable();

export const rawExtractionSchema = z.strictObject({
  schema_version: z.literal(CANDIDATE_EXTRACT_CONTRACT_VERSION),
  full_name: nullableText,
  headline: nullableText,
  email: nullableText,
  phone: nullableText,
  location: nullableText,
  linkedin_url: nullableText,
  github_url: nullableText,
});

export type RawExtraction = z.infer<typeof rawExtractionSchema>;

/** Strict structured-output schema sent to the model; mirrors `rawExtractionSchema`. */
export const CANDIDATE_EXTRACT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "full_name",
    "headline",
    "email",
    "phone",
    "location",
    "linkedin_url",
    "github_url",
  ],
  properties: {
    schema_version: { type: "string", enum: [CANDIDATE_EXTRACT_CONTRACT_VERSION] },
    full_name: {
      type: ["string", "null"],
      description: "The candidate's own full name exactly as written in the CV, or null.",
    },
    headline: {
      type: ["string", "null"],
      description:
        "The candidate's own current title or tagline if one is stated (at most twelve words), copied as written, or null.",
    },
    email: {
      type: ["string", "null"],
      description: "The candidate's own email address exactly as written, or null.",
    },
    phone: {
      type: ["string", "null"],
      description: "The candidate's own phone number exactly as written, or null.",
    },
    location: {
      type: ["string", "null"],
      description: "The candidate's own city and/or country exactly as written, or null.",
    },
    linkedin_url: {
      type: ["string", "null"],
      description: "The candidate's LinkedIn profile URL exactly as written, or null.",
    },
    github_url: {
      type: ["string", "null"],
      description:
        "The candidate's GitHub profile URL (the account page, not a repository) exactly as written, or null.",
    },
  },
} as const;

export type ParsedExtraction = { ok: true; raw: RawExtraction } | { ok: false; message: string };

/** Parses model output (JSON text or value). Never throws; messages are content-free. */
export function parseExtraction(raw: unknown): ParsedExtraction {
  let value: unknown = raw;
  if (typeof raw === "string") {
    const text = raw.trim();
    if (text.length === 0) return { ok: false, message: "The model returned no output." };
    try {
      value = JSON.parse(text);
    } catch {
      return { ok: false, message: "The model returned output that is not valid JSON." };
    }
  }
  const parsed = rawExtractionSchema.safeParse(value);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path.length ? ` at ${first.path.map(String).join(".")}` : "";
    return {
      ok: false,
      message: `The model output did not match the ${CANDIDATE_EXTRACT_CONTRACT_VERSION} contract${where}.`,
    };
  }
  return { ok: true, raw: parsed.data };
}

export type CandidatePrefill = {
  /** Field values that passed validation; only these are offered to the recruiter. */
  values: Partial<Record<ExtractedField, string>>;
  /** Plain-language notes about values that were found but dropped. */
  warnings: string[];
};

function clean(value: string | null, max: number): string | null {
  if (value === null) return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length === 0 || text.length > max) return null;
  return text;
}

/** Adds https:// to a bare profile host the CV may have printed without a scheme. */
function withScheme(value: string): string {
  return /^[a-z]+:\/\//i.test(value) ? value : `https://${value}`;
}

const emailSchema = z.email().max(254);

/**
 * Applies the candidate form's own rules to the raw extraction. Invalid values are dropped
 * (never "fixed" into something the CV did not say) and explained in `warnings`.
 */
export function sanitizeExtractedCandidate(raw: RawExtraction): CandidatePrefill {
  const values: Partial<Record<ExtractedField, string>> = {};
  const warnings: string[] = [];

  const fullName = clean(raw.full_name, 160);
  if (fullName && fullName.length >= 2) values.fullName = fullName;

  const headline = clean(raw.headline, 160);
  if (headline) values.headline = headline;

  const location = clean(raw.location, 120);
  if (location) values.location = location;

  const phone = clean(raw.phone, 40);
  if (phone) values.phone = phone;

  const email = clean(raw.email, 254);
  if (email) {
    if (emailSchema.safeParse(email).success) values.email = email;
    else warnings.push("An email address in the CV did not look valid and was left empty.");
  }

  const linkedin = clean(raw.linkedin_url, 300);
  if (linkedin) {
    const candidate = withScheme(linkedin);
    if (linkedinUrlSchema.safeParse(candidate).success) values.linkedinUrl = candidate;
    else warnings.push("A LinkedIn link in the CV was not a valid profile URL and was left empty.");
  }

  const github = clean(raw.github_url, 200);
  if (github) {
    const candidate = withScheme(github);
    if (githubUrlSchema.safeParse(candidate).success) values.githubUrl = candidate;
    else {
      warnings.push(
        "A GitHub link in the CV was not a profile URL (for example a repository) and was left empty.",
      );
    }
  }

  return { values, warnings };
}
