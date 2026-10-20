import { z } from "zod";
import { emptyToUndefined, optionalText, parseHttpsUrl } from "./common";

const LINKEDIN_HOST = /^([a-z]{2,3}\.)?linkedin\.com$/i;
// GitHub logins: 1-39 alphanumeric characters or hyphens, no leading/trailing hyphen.
const GITHUB_PROFILE_PATH = /^\/[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/?$/;

/**
 * A LinkedIn profile link is stored for manual review only (never scraped). The host
 * check keeps unrelated or dangerous links from being rendered under a "LinkedIn" label.
 */
export const linkedinUrlSchema = z
  .string()
  .trim()
  .max(300)
  .refine(
    (value) => {
      const url = parseHttpsUrl(value);
      return url !== null && LINKEDIN_HOST.test(url.hostname) && url.pathname.length > 1;
    },
    { message: "Enter a full LinkedIn profile URL, for example https://www.linkedin.com/in/name" },
  );

/**
 * Only a public profile URL is accepted (https://github.com/login). Repository and
 * organization paths are rejected so that optional enrichment always starts from a login.
 */
export const githubUrlSchema = z
  .string()
  .trim()
  .max(200)
  .refine(
    (value) => {
      const url = parseHttpsUrl(value);
      return (
        url !== null && url.hostname === "github.com" && GITHUB_PROFILE_PATH.test(url.pathname)
      );
    },
    { message: "Enter a GitHub profile URL, for example https://github.com/username" },
  );

export const candidateInputSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the candidate's name").max(160),
  email: z.preprocess(emptyToUndefined, z.email("Enter a valid email address").max(254).optional()),
  phone: optionalText(40),
  headline: optionalText(160),
  location: optionalText(120),
  linkedinUrl: z.preprocess(emptyToUndefined, linkedinUrlSchema.optional()),
  githubUrl: z.preprocess(emptyToUndefined, githubUrlSchema.optional()),
  notes: optionalText(10_000),
});

export type CandidateInput = z.infer<typeof candidateInputSchema>;

/**
 * Sentinel submitted by the "Add to job" select for "No job yet". Radix Select cannot use
 * an empty string as an item value, so this stands in for "no selection" and the schema maps
 * it (like an empty string) back to undefined — otherwise it would fail UUID validation.
 */
export const NO_JOB_OPTION = "none";

/** Create form: optionally add the new candidate to a job in the same step. */
export const createCandidateSchema = candidateInputSchema.extend({
  jobId: z.preprocess((value) => {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed === "" || trimmed === NO_JOB_OPTION ? undefined : trimmed;
  }, z.uuid("Select a job from this workspace").optional()),
});

export type CreateCandidateInput = z.infer<typeof createCandidateSchema>;

/**
 * Recording AI-use authorization for a candidate-provided CV (docs/SECURITY.md §9): an
 * explicit confirmation (never pre-checked) and a stated basis. Revocation needs no input.
 */
export const cvAiAuthorizationSchema = z.object({
  confirm: z.literal("yes", { message: "Confirm the authorization to proceed" }),
  basis: z
    .string()
    .trim()
    .min(3, "State the basis for this authorization")
    .max(500, "Keep the basis under 500 characters"),
});

export type CvAiAuthorizationInput = z.infer<typeof cvAiAuthorizationSchema>;
