import { describe, expect, it } from "vitest";
import {
  daysInStage,
  escapeLikePattern,
  formatStageAge,
  groupByStage,
  parsePipelineFilters,
  type PipelineCard,
} from "@/lib/pipeline";

function card(overrides: Partial<PipelineCard>): PipelineCard {
  return {
    id: "a",
    stage: "new",
    stageChangedAt: "2026-10-19T10:00:00.000Z",
    jobId: "j",
    jobTitle: "Job",
    candidateId: "c",
    candidateName: "Candidate",
    candidateHeadline: null,
    ...overrides,
  };
}

describe("groupByStage", () => {
  it("creates every column, even empty ones, and orders newest stage change first", () => {
    const groups = groupByStage([
      card({ id: "1", stage: "interview", stageChangedAt: "2026-10-18T00:00:00Z" }),
      card({ id: "2", stage: "interview", stageChangedAt: "2026-10-19T00:00:00Z" }),
      card({ id: "3", stage: "hired" }),
    ]);
    expect(Object.keys(groups)).toEqual([
      "new",
      "screening",
      "interview",
      "offer",
      "hired",
      "rejected",
    ]);
    expect(groups.interview.map((item) => item.id)).toEqual(["2", "1"]);
    expect(groups.new).toEqual([]);
    expect(groups.hired).toHaveLength(1);
  });
});

describe("escapeLikePattern", () => {
  it("escapes wildcard characters so they match literally", () => {
    expect(escapeLikePattern("100% a_b \\ c")).toBe("100\\% a\\_b \\\\ c");
    expect(escapeLikePattern("ada")).toBe("ada");
  });
});

describe("stage age", () => {
  const now = Date.parse("2026-10-19T12:00:00Z");

  it("counts whole days and never goes negative", () => {
    expect(daysInStage("2026-10-19T09:00:00Z", now)).toBe(0);
    expect(daysInStage("2026-10-17T12:00:00Z", now)).toBe(2);
    expect(daysInStage("2026-10-20T12:00:00Z", now)).toBe(0);
    expect(daysInStage("not a date", now)).toBe(0);
  });

  it("formats for the card", () => {
    expect(formatStageAge(0)).toBe("today");
    expect(formatStageAge(1)).toBe("1 day");
    expect(formatStageAge(5)).toBe("5 days");
  });
});

describe("parsePipelineFilters", () => {
  const jobId = "44444444-4444-4444-8444-444444444444";

  it("accepts a job id and a trimmed name query, and combines them", () => {
    expect(parsePipelineFilters({ job: jobId, q: "  Ada " })).toEqual({ jobId, q: "Ada" });
  });

  it("ignores the 'all' sentinel, malformed ids, empty queries and repeated params", () => {
    expect(parsePipelineFilters({ job: "all" })).toEqual({});
    expect(parsePipelineFilters({ job: "not-a-uuid", q: "" })).toEqual({});
    expect(parsePipelineFilters({ job: [jobId, "other"], q: ["x", "y"] })).toEqual({
      jobId,
      q: "x",
    });
    expect(parsePipelineFilters({})).toEqual({});
  });

  it("caps very long queries instead of failing", () => {
    expect(parsePipelineFilters({ q: "a".repeat(500) })).toEqual({});
  });
});
