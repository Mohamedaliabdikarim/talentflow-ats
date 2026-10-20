import { describe, expect, it } from "vitest";
import {
  CANDIDATE_EXTRACT_CONTRACT_VERSION,
  CANDIDATE_EXTRACT_JSON_SCHEMA,
  EXTRACTED_FIELDS,
  parseExtraction,
  type RawExtraction,
  sanitizeExtractedCandidate,
} from "@/lib/ai/candidate-extract-contract";

/**
 * CV detail extraction contract (ADR-039): strict shape, literal-or-null fields, and the
 * sanitiser that applies the candidate form's own rules before anything can prefill a field.
 */

const raw: RawExtraction = {
  schema_version: CANDIDATE_EXTRACT_CONTRACT_VERSION,
  full_name: "  Alex   Example ",
  headline: "Senior backend engineer",
  email: "alex@example.test",
  phone: "+47 912 34 567",
  location: "Oslo, Norway",
  linkedin_url: "linkedin.com/in/alex-example",
  github_url: "https://github.com/alexexample",
};

describe("parseExtraction", () => {
  it("accepts a valid object and JSON text", () => {
    expect(parseExtraction(raw)).toEqual({ ok: true, raw });
    expect(parseExtraction(JSON.stringify(raw))).toEqual({ ok: true, raw });
  });

  it("rejects extra keys (no summary, skills or score can sneak in) and a wrong version", () => {
    expect(parseExtraction({ ...raw, summary: "Great candidate" }).ok).toBe(false);
    expect(parseExtraction({ ...raw, years_of_experience: 7 }).ok).toBe(false);
    expect(parseExtraction({ ...raw, schema_version: "v0" }).ok).toBe(false);
  });

  it("returns content-free messages for empty or invalid output", () => {
    expect(parseExtraction("")).toEqual({ ok: false, message: "The model returned no output." });
    expect(parseExtraction("{nope")).toMatchObject({ ok: false, message: /not valid JSON/ });
    const result = parseExtraction({ ...raw, email: 12345 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).not.toContain("alex");
  });
});

describe("sanitizeExtractedCandidate", () => {
  it("trims and normalises whitespace, adds https to bare profile hosts, keeps valid values", () => {
    const { values, warnings } = sanitizeExtractedCandidate(raw);
    expect(values).toEqual({
      fullName: "Alex Example",
      headline: "Senior backend engineer",
      email: "alex@example.test",
      phone: "+47 912 34 567",
      location: "Oslo, Norway",
      linkedinUrl: "https://linkedin.com/in/alex-example",
      githubUrl: "https://github.com/alexexample",
    });
    expect(warnings).toEqual([]);
  });

  it("drops nulls and empty strings silently", () => {
    const { values, warnings } = sanitizeExtractedCandidate({
      ...raw,
      headline: null,
      phone: "   ",
      location: null,
      linkedin_url: null,
      github_url: null,
    });
    expect(values).toEqual({
      fullName: "Alex Example",
      email: "alex@example.test",
    });
    expect(warnings).toEqual([]);
  });

  it("drops an invalid email with a warning instead of guessing", () => {
    const { values, warnings } = sanitizeExtractedCandidate({ ...raw, email: "alex at example" });
    expect(values.email).toBeUndefined();
    expect(warnings).toEqual([expect.stringMatching(/email address.*left empty/)]);
  });

  it("drops a GitHub repository link and a non-LinkedIn link with warnings", () => {
    const { values, warnings } = sanitizeExtractedCandidate({
      ...raw,
      github_url: "https://github.com/alexexample/some-repo",
      linkedin_url: "https://example.test/alex",
    });
    expect(values.githubUrl).toBeUndefined();
    expect(values.linkedinUrl).toBeUndefined();
    expect(warnings).toHaveLength(2);
    expect(warnings.join(" ")).toMatch(/repository/);
    expect(warnings.join(" ")).toMatch(/LinkedIn link/);
  });

  it("rejects over-long or one-character values rather than truncating them", () => {
    const { values } = sanitizeExtractedCandidate({
      ...raw,
      full_name: "A",
      headline: "x".repeat(161),
      location: "y".repeat(121),
    });
    expect(values.fullName).toBeUndefined();
    expect(values.headline).toBeUndefined();
    expect(values.location).toBeUndefined();
  });

  it("never emits a field outside the form's extractable set", () => {
    const { values } = sanitizeExtractedCandidate(raw);
    for (const key of Object.keys(values)) {
      expect(EXTRACTED_FIELDS).toContain(key);
    }
  });
});

describe("CANDIDATE_EXTRACT_JSON_SCHEMA stays aligned with the Zod contract", () => {
  it("requires every property, forbids extras, and makes every detail nullable", () => {
    expect(CANDIDATE_EXTRACT_JSON_SCHEMA.additionalProperties).toBe(false);
    expect([...CANDIDATE_EXTRACT_JSON_SCHEMA.required].sort()).toEqual(
      Object.keys(CANDIDATE_EXTRACT_JSON_SCHEMA.properties).sort(),
    );
    const { schema_version, ...details } = CANDIDATE_EXTRACT_JSON_SCHEMA.properties;
    expect([...schema_version.enum]).toEqual([CANDIDATE_EXTRACT_CONTRACT_VERSION]);
    for (const property of Object.values(details)) {
      expect([...property.type]).toEqual(["string", "null"]);
    }
    expect(Object.keys(details)).toHaveLength(EXTRACTED_FIELDS.length);
  });
});
