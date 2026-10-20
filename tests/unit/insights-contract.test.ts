import { describe, expect, it } from "vitest";
import {
  ASSESSMENT_STATUSES,
  enforceEvidenceProvenance,
  EVIDENCE_SOURCES,
  JOB_MATCH_CONTRACT_VERSION,
  JOB_MATCH_JSON_SCHEMA,
  JOB_MATCH_LEGACY_CONTRACT_VERSION,
  type JobMatchResult,
  parseJobMatchResult,
} from "@/lib/ai/insights-contract";

/**
 * Contract A (docs/AI_INSIGHTS.md §3, §8.2): the validated output schema (v2), legacy v1
 * normalisation, and server-side evidence provenance. Pure, no network.
 */

const REPO = "https://github.com/octocat/hello-world";

const valid: JobMatchResult = {
  schema_version: JOB_MATCH_CONTRACT_VERSION,
  summary: "The CV shows several years of TypeScript work; cloud experience is not evidenced.",
  github_overview: "The hello-world repository shows exposure to TypeScript tooling.",
  assessments: [
    {
      requirement: "TypeScript",
      status: "supported",
      evidence: [
        { source: "cv", text: "Lists TypeScript on two recent roles.", repository_url: null },
        { source: "github", text: "hello-world is written in TypeScript.", repository_url: REPO },
      ],
    },
    {
      requirement: "Azure",
      status: "not_evidenced",
      evidence: [
        { source: "cv", text: "No mention of Azure or any cloud platform.", repository_url: null },
      ],
    },
  ],
  interview_questions: ["Which cloud platforms have you deployed to, if any?"],
  advisory_notice: "This assessment is advisory and must be reviewed by a person.",
};

describe("parseJobMatchResult (v2)", () => {
  it("accepts a valid result as an object and as JSON text", () => {
    expect(parseJobMatchResult(valid)).toEqual({
      ok: true,
      result: valid,
      version: "job-match-v2",
    });
    expect(parseJobMatchResult(JSON.stringify(valid))).toMatchObject({ ok: true, result: valid });
  });

  it("rejects an assessment status outside the three allowed values", () => {
    const result = parseJobMatchResult({
      ...valid,
      assessments: [{ ...valid.assessments[0], status: "strong" }],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects extra keys at every level, so a score or rating can never sneak in", () => {
    expect(parseJobMatchResult({ ...valid, score: 87 }).ok).toBe(false);
    expect(
      parseJobMatchResult({
        ...valid,
        assessments: [{ ...valid.assessments[0], rating: 5 }],
      }).ok,
    ).toBe(false);
    expect(
      parseJobMatchResult({
        ...valid,
        assessments: [
          {
            ...valid.assessments[0],
            evidence: [{ source: "cv", text: "x", repository_url: null, confidence: 0.9 }],
          },
        ],
      }).ok,
    ).toBe(false);
  });

  it("rejects an unknown evidence source and an empty evidence list", () => {
    expect(
      parseJobMatchResult({
        ...valid,
        assessments: [
          {
            ...valid.assessments[0],
            evidence: [{ source: "linkedin", text: "x", repository_url: null }],
          },
        ],
      }).ok,
    ).toBe(false);
    expect(
      parseJobMatchResult({ ...valid, assessments: [{ ...valid.assessments[0], evidence: [] }] })
        .ok,
    ).toBe(false);
  });

  it("rejects an empty assessments list, missing fields and a foreign schema version", () => {
    expect(parseJobMatchResult({ ...valid, assessments: [] }).ok).toBe(false);
    const withoutNotice: Record<string, unknown> = { ...valid };
    delete withoutNotice.advisory_notice;
    expect(parseJobMatchResult(withoutNotice).ok).toBe(false);
    expect(parseJobMatchResult({ ...valid, schema_version: "job-match-v9" }).ok).toBe(false);
  });

  it("returns safe messages for empty and non-JSON output and never echoes content", () => {
    expect(parseJobMatchResult("")).toEqual({
      ok: false,
      message: "The model returned no output.",
    });
    expect(parseJobMatchResult("not json {")).toMatchObject({
      ok: false,
      message: /not valid JSON/,
    });
    const result = parseJobMatchResult({
      ...valid,
      summary: "CANDIDATE-PRIVATE-DETAIL",
      assessments: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).not.toContain("CANDIDATE-PRIVATE-DETAIL");
  });
});

describe("legacy job-match-v1 results", () => {
  const legacy = {
    schema_version: JOB_MATCH_LEGACY_CONTRACT_VERSION,
    summary: "Older summary.",
    assessments: [{ requirement: "TypeScript", status: "supported", evidence: "Recent roles." }],
    interview_questions: [],
    advisory_notice: "Advisory.",
  };

  it("normalises a stored v1 result into the v2 shape as CV-only evidence", () => {
    const parsed = parseJobMatchResult(legacy);
    expect(parsed).toMatchObject({ ok: true, version: "job-match-v1" });
    if (!parsed.ok) return;
    expect(parsed.result.schema_version).toBe(JOB_MATCH_CONTRACT_VERSION);
    expect(parsed.result.github_overview).toBe("");
    expect(parsed.result.assessments[0]!.evidence).toEqual([
      { source: "cv", text: "Recent roles.", repository_url: null },
    ]);
  });

  it("still validates v1 strictly", () => {
    expect(parseJobMatchResult({ ...legacy, score: 1 }).ok).toBe(false);
  });
});

describe("enforceEvidenceProvenance", () => {
  it("fails when the model attributes evidence to GitHub without GitHub evidence", () => {
    const outcome = enforceEvidenceProvenance(valid, {
      githubProvided: false,
      allowedRepositoryUrls: [],
    });
    expect(outcome).toMatchObject({ ok: false, message: /attributed evidence to GitHub/ });
  });

  it("keeps only repository links that were given to the model and strips links from CV items", () => {
    const tampered: JobMatchResult = {
      ...valid,
      assessments: [
        {
          requirement: "TypeScript",
          status: "supported",
          evidence: [
            { source: "cv", text: "x", repository_url: "https://github.com/octocat/hello-world" },
            { source: "github", text: "y", repository_url: "https://github.com/octocat/invented" },
            {
              source: "github",
              text: "z",
              repository_url: "https://github.com/octocat/hello-world/",
            },
          ],
        },
      ],
    };
    const outcome = enforceEvidenceProvenance(tampered, {
      githubProvided: true,
      allowedRepositoryUrls: [REPO],
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const evidence = outcome.result.assessments[0]!.evidence;
    expect(evidence[0]!.repository_url).toBeNull();
    expect(evidence[1]!.repository_url).toBeNull();
    expect(evidence[2]!.repository_url).toBe(REPO); // trailing slash normalised to the given URL
  });

  it("blanks the GitHub overview when no GitHub evidence was provided", () => {
    const cvOnly: JobMatchResult = {
      ...valid,
      github_overview: "Claims about repositories",
      assessments: [valid.assessments[1]!],
    };
    const outcome = enforceEvidenceProvenance(cvOnly, {
      githubProvided: false,
      allowedRepositoryUrls: [],
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.result.github_overview).toBe("");
  });
});

describe("JOB_MATCH_JSON_SCHEMA stays aligned with the Zod contract", () => {
  it("requires every property and forbids additional ones at all three levels", () => {
    expect(JOB_MATCH_JSON_SCHEMA.additionalProperties).toBe(false);
    expect([...JOB_MATCH_JSON_SCHEMA.required].sort()).toEqual(
      Object.keys(JOB_MATCH_JSON_SCHEMA.properties).sort(),
    );
    const assessment = JOB_MATCH_JSON_SCHEMA.properties.assessments.items;
    expect(assessment.additionalProperties).toBe(false);
    expect([...assessment.required].sort()).toEqual(Object.keys(assessment.properties).sort());
    const evidence = assessment.properties.evidence.items;
    expect(evidence.additionalProperties).toBe(false);
    expect([...evidence.required].sort()).toEqual(Object.keys(evidence.properties).sort());
  });

  it("lists exactly the contract's statuses, sources and version", () => {
    const assessment = JOB_MATCH_JSON_SCHEMA.properties.assessments.items;
    expect([...assessment.properties.status.enum]).toEqual([...ASSESSMENT_STATUSES]);
    expect([...assessment.properties.evidence.items.properties.source.enum]).toEqual([
      ...EVIDENCE_SOURCES,
    ]);
    expect([...JOB_MATCH_JSON_SCHEMA.properties.schema_version.enum]).toEqual([
      JOB_MATCH_CONTRACT_VERSION,
    ]);
    expect([...assessment.properties.evidence.items.properties.repository_url.type]).toEqual([
      "string",
      "null",
    ]);
  });
});
