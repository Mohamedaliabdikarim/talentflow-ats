import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { CV_MAX_BYTES, CV_MAX_LABEL, validateCvMetadata } from "@/lib/validation/cv";

/**
 * Upload limits stay consistent (ADR-041): the CV limit the user sees, the Server Action body
 * limit in next.config.ts, and Vercel's 4.5 MB request-body cap. A CV at the limit must fit in
 * one Server Action request together with the multipart form overhead.
 */

const VERCEL_REQUEST_BODY_CAP = 4.5 * 1024 * 1024;
/** Generous allowance for multipart boundaries and the other form fields. */
const FORM_OVERHEAD_BYTES = 64 * 1024;

function parseSizeLimit(value: unknown): number {
  if (typeof value === "number") return value;
  const match = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)$/i.exec(String(value));
  if (!match) throw new Error(`unrecognised size limit: ${String(value)}`);
  const units: Record<string, number> = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 };
  return Number(match[1]) * units[match[2]!.toLowerCase()]!;
}

describe("CV size limit", () => {
  const pdf = (size: number) => ({ name: "cv.pdf", type: "application/pdf", size });

  it("is 4 MB and labelled as such", () => {
    expect(CV_MAX_BYTES).toBe(4 * 1024 * 1024);
    expect(CV_MAX_LABEL).toBe("4 MB");
  });

  it("accepts a file exactly at the limit and rejects one byte more, naming the limit", () => {
    expect(validateCvMetadata(pdf(CV_MAX_BYTES))).toMatchObject({ ok: true, size: CV_MAX_BYTES });
    const rejected = validateCvMetadata(pdf(CV_MAX_BYTES + 1));
    expect(rejected).toEqual({
      ok: false,
      message: `The file is larger than the ${CV_MAX_LABEL} limit.`,
    });
  });

  it("rejects the old 10 MB size that the database and bucket would still accept", () => {
    expect(validateCvMetadata(pdf(10 * 1024 * 1024)).ok).toBe(false);
  });
});

describe("Server Action body limit", () => {
  const limit = parseSizeLimit(nextConfig.experimental?.serverActions?.bodySizeLimit);

  it("is configured explicitly", () => {
    expect(nextConfig.experimental?.serverActions?.bodySizeLimit).toBeDefined();
  });

  it("fits a CV at the limit plus form overhead", () => {
    expect(limit).toBeGreaterThanOrEqual(CV_MAX_BYTES + FORM_OVERHEAD_BYTES);
  });

  it("stays under Vercel's 4.5 MB request-body cap", () => {
    expect(limit).toBeLessThan(VERCEL_REQUEST_BODY_CAP);
  });
});
