import { describe, expect, it } from "vitest";
import {
  ASSESSMENT_STATUSES,
  JOB_MATCH_CONTRACT_VERSION,
  JOB_MATCH_JSON_SCHEMA,
  parseJobMatchResult,
} from "@/lib/ai/insights-contract";

/**
 * Contract A (docs/AI_INSIGHTS.md §3): the validated output schema. Pure, no network.
 */

const valid = {
  schema_version: JOB_MATCH_CONTRACT_VERSION,
  summary: "The CV shows several years of TypeScript work; cloud experience is not evidenced.",
  assessments: [
    {
      requirement: "TypeScript",
      status: "supported",
      evidence: "Lists TypeScript on two recent roles.",
    },
    {
      requirement: "Azure",
      status: "not_evidenced",
      evidence: "No mention of Azure or any cloud platform in the CV.",
    },
  ],
  interview_questions: ["Which cloud platforms have you deployed to, if any?"],
  advisory_notice: "This assessment is advisory and must be reviewed by a person.",
};

describe("parseJobMatchResult", () => {
  it("accepts a valid result as an object and as JSON text", () => {
    expect(parseJobMatchResult(valid)).toEqual({ ok: true, result: valid });
    expect(parseJobMatchResult(JSON.stringify(valid))).toEqual({ ok: true, result: valid });
  });

  it("rejects an assessment status outside the three allowed values", () => {
    const result = parseJobMatchResult({
      ...valid,
      assessments: [{ requirement: "Go", status: "strong", evidence: "x" }],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects extra top-level keys, so a score or recommendation can never sneak in", () => {
    expect(parseJobMatchResult({ ...valid, score: 87 }).ok).toBe(false);
    expect(parseJobMatchResult({ ...valid, recommendation: "hire" }).ok).toBe(false);
  });

  it("rejects extra keys inside an assessment", () => {
    const result = parseJobMatchResult({
      ...valid,
      assessments: [{ ...valid.assessments[0], rating: 5 }],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an empty assessments list and missing fields", () => {
    expect(parseJobMatchResult({ ...valid, assessments: [] }).ok).toBe(false);
    const withoutNotice: Record<string, unknown> = { ...valid };
    delete withoutNotice.advisory_notice;
    expect(parseJobMatchResult(withoutNotice).ok).toBe(false);
  });

  it("rejects a different schema version", () => {
    expect(parseJobMatchResult({ ...valid, schema_version: "job-match-v0" }).ok).toBe(false);
  });

  it("returns safe messages for empty and non-JSON output", () => {
    expect(parseJobMatchResult("")).toEqual({
      ok: false,
      message: "The model returned no output.",
    });
    const result = parseJobMatchResult("not json {");
    expect(result).toMatchObject({ ok: false, message: /not valid JSON/ });
  });

  it("never echoes content in a validation message", () => {
    const result = parseJobMatchResult({
      ...valid,
      summary: "CANDIDATE-PRIVATE-DETAIL",
      assessments: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).not.toContain("CANDIDATE-PRIVATE-DETAIL");
      expect(result.message).toContain(JOB_MATCH_CONTRACT_VERSION);
    }
  });
});

describe("JOB_MATCH_JSON_SCHEMA stays aligned with the Zod contract", () => {
  it("requires every property and forbids additional properties at both levels", () => {
    expect(JOB_MATCH_JSON_SCHEMA.additionalProperties).toBe(false);
    expect([...JOB_MATCH_JSON_SCHEMA.required].sort()).toEqual(
      Object.keys(JOB_MATCH_JSON_SCHEMA.properties).sort(),
    );
    const item = JOB_MATCH_JSON_SCHEMA.properties.assessments.items;
    expect(item.additionalProperties).toBe(false);
    expect([...item.required].sort()).toEqual(Object.keys(item.properties).sort());
  });

  it("lists exactly the contract's assessment statuses", () => {
    expect([...JOB_MATCH_JSON_SCHEMA.properties.assessments.items.properties.status.enum]).toEqual([
      ...ASSESSMENT_STATUSES,
    ]);
  });

  it("pins schema_version to the contract version", () => {
    expect([...JOB_MATCH_JSON_SCHEMA.properties.schema_version.enum]).toEqual([
      JOB_MATCH_CONTRACT_VERSION,
    ]);
  });
});
