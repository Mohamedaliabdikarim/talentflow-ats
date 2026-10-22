import { beforeEach, describe, expect, it, vi } from "vitest";
import { JOB_MATCH_CONTRACT_VERSION, type JobMatchResult } from "@/lib/ai/insights-contract";

vi.mock("server-only", () => ({}));
vi.mock("unpdf", () => ({ extractText: vi.fn() }));

const generateStructured = vi.fn();
vi.mock("@/lib/ai/client", () => ({
  generateStructured: (...args: unknown[]) => generateStructured(...args),
}));

const { analyzeJobMatch, InsightRunError } = await import("@/lib/ai/job-match");

/**
 * The analyzer's post-validation honesty gate: a summary that names something absent from the
 * material and the cited evidence fails the run instead of being shown (docs/AI_INSIGHTS.md §3).
 */

const result: JobMatchResult = {
  schema_version: JOB_MATCH_CONTRACT_VERSION,
  summary: "The CV shows TypeScript work since 2019; Azure is not evidenced.",
  github_overview: "",
  assessments: [
    {
      requirement: "TypeScript",
      status: "supported",
      evidence: [{ source: "cv", text: "TypeScript since 2019.", repository_url: null }],
    },
    {
      requirement: "Azure",
      status: "not_evidenced",
      evidence: [{ source: "cv", text: "No mention of Azure.", repository_url: null }],
    },
  ],
  interview_questions: [],
  advisory_notice: "Advisory only; a person reviews it.",
};

const params = {
  jobTitle: "Fullstack Developer",
  jobDescription: "TypeScript and Azure.",
  cvText: "Senior engineer, TypeScript since 2019.",
};

function respond(summary: string) {
  generateStructured.mockResolvedValue({
    text: JSON.stringify({ ...result, summary }),
    model: "gpt-5-mini-2025-08-07",
    incomplete: false,
    inputTokens: 1,
    outputTokens: 1,
    totalTokens: 2,
  });
}

beforeEach(() => generateStructured.mockReset());

describe("analyzeJobMatch summary grounding", () => {
  it("returns a grounded summary unchanged", async () => {
    respond(result.summary);
    const analysis = await analyzeJobMatch(params);
    expect(analysis.result.summary).toBe(result.summary);
    expect(analysis.contractVersion).toBe(JOB_MATCH_CONTRACT_VERSION);
  });

  it("rejects a summary that introduces an employer or title absent from the evidence", async () => {
    respond("The candidate was Head of Platform at Acme Corp and shows TypeScript work.");
    await expect(analyzeJobMatch(params)).rejects.toThrowError(InsightRunError);
    respond("The candidate was Head of Platform at Acme Corp and shows TypeScript work.");
    await expect(analyzeJobMatch(params)).rejects.toThrow(
      /not in the provided material or the cited evidence: Head, Platform, Acme/,
    );
  });
});
