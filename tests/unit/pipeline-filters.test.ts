import { describe, expect, it } from "vitest";
import {
  daysInStage,
  escapeLikePattern,
  formatStageAge,
  groupByStage,
  parsePipelineFilters,
  type PipelineCard,
} from "@/lib/pipeline";

/**
 * Pure filter-input handling for the pipeline: URL parsing never throws on bad input, the
 * "all jobs" sentinel and malformed ids mean no job filter, the name query is trimmed and
 * capped, and LIKE wildcards are escaped so a search for "100%" is a literal search.
 */

const JOB_ID = "33333333-3333-4333-8333-333333333333";

describe("parsePipelineFilters", () => {
  it("returns no filters for empty input", () => {
    expect(parsePipelineFilters({})).toEqual({});
  });

  it("accepts a valid job id and a trimmed name query", () => {
    expect(parsePipelineFilters({ job: JOB_ID, q: "  Ada  " })).toEqual({
      jobId: JOB_ID,
      q: "Ada",
    });
  });

  it("ignores the 'all' sentinel and malformed job ids (no job filter)", () => {
    expect(parsePipelineFilters({ job: "all" }).jobId).toBeUndefined();
    expect(parsePipelineFilters({ job: "not-a-uuid" }).jobId).toBeUndefined();
  });

  it("drops an empty or whitespace-only name query", () => {
    expect(parsePipelineFilters({ q: "   " }).q).toBeUndefined();
    expect(parsePipelineFilters({ q: "" }).q).toBeUndefined();
  });

  it("drops an over-long name query rather than truncating it into a surprise match", () => {
    expect(parsePipelineFilters({ q: "a".repeat(200) }).q).toBeUndefined();
  });

  it("takes the first value when a param is repeated", () => {
    expect(parsePipelineFilters({ job: [JOB_ID, "second"], q: ["ada", "bob"] })).toEqual({
      jobId: JOB_ID,
      q: "ada",
    });
  });
});

describe("escapeLikePattern", () => {
  it("escapes LIKE wildcards so they match literally", () => {
    expect(escapeLikePattern("100%")).toBe("100\\%");
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
    expect(escapeLikePattern("x\\y")).toBe("x\\\\y");
  });

  it("leaves ordinary names unchanged", () => {
    expect(escapeLikePattern("Ada Lovelace")).toBe("Ada Lovelace");
  });
});

function card(id: string, stage: PipelineCard["stage"], stageChangedAt: string): PipelineCard {
  return {
    id,
    stage,
    stageChangedAt,
    jobId: "j",
    jobTitle: "Job",
    candidateId: `c-${id}`,
    candidateName: id,
    candidateHeadline: null,
  };
}

describe("groupByStage", () => {
  it("places every stage and orders each column by most recent change", () => {
    const groups = groupByStage([
      card("a", "screening", "2026-10-01T00:00:00Z"),
      card("b", "screening", "2026-10-03T00:00:00Z"),
      card("c", "new", "2026-10-02T00:00:00Z"),
    ]);
    expect(Object.keys(groups)).toEqual([
      "new",
      "screening",
      "interview",
      "offer",
      "hired",
      "rejected",
    ]);
    expect(groups.screening.map((entry) => entry.id)).toEqual(["b", "a"]);
    expect(groups.new.map((entry) => entry.id)).toEqual(["c"]);
    expect(groups.offer).toEqual([]);
  });
});

describe("daysInStage / formatStageAge", () => {
  const now = Date.parse("2026-10-20T00:00:00Z");
  it("counts whole days and never goes negative", () => {
    expect(daysInStage("2026-10-20T00:00:00Z", now)).toBe(0);
    expect(daysInStage("2026-10-18T00:00:00Z", now)).toBe(2);
    expect(daysInStage("2026-10-25T00:00:00Z", now)).toBe(0);
  });
  it("formats the age readably", () => {
    expect(formatStageAge(0)).toBe("today");
    expect(formatStageAge(1)).toBe("1 day");
    expect(formatStageAge(5)).toBe("5 days");
  });
});
