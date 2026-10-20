import { describe, expect, it } from "vitest";
import { createCandidateSchema, NO_JOB_OPTION } from "@/lib/validation/candidate";

/**
 * Regression for the "No job yet" bug: the job select submits the NO_JOB_OPTION sentinel,
 * which must be treated as "no job", distinct from an empty string and from an invalid id.
 */

const base = { fullName: "CV Test Candidate" };

describe("createCandidateSchema jobId handling", () => {
  it("treats the 'No job yet' sentinel as no job (not an invalid UUID)", () => {
    const result = createCandidateSchema.safeParse({ ...base, jobId: NO_JOB_OPTION });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.jobId).toBeUndefined();
  });

  it("treats an empty or whitespace jobId as no job", () => {
    for (const jobId of ["", "   "]) {
      const result = createCandidateSchema.safeParse({ ...base, jobId });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.jobId).toBeUndefined();
    }
  });

  it("accepts a valid job UUID", () => {
    const id = "33333333-3333-4333-8333-333333333333";
    const result = createCandidateSchema.safeParse({ ...base, jobId: id });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.jobId).toBe(id);
  });

  it("rejects a non-UUID, non-sentinel jobId", () => {
    const result = createCandidateSchema.safeParse({ ...base, jobId: "garbage" });
    expect(result.success).toBe(false);
  });

  it("still requires a valid name regardless of the job value", () => {
    expect(createCandidateSchema.safeParse({ fullName: "A", jobId: NO_JOB_OPTION }).success).toBe(
      false,
    );
  });
});
