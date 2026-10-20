import { describe, expect, it } from "vitest";
import {
  buildCvObjectKey,
  CV_MAX_BYTES,
  hasPdfSignature,
  sanitizeCvFilename,
  validateCvFile,
  validateCvMetadata,
} from "@/lib/validation/cv";

/** CV upload validation (ADR-033): PDF only, size limit, signature, safe filename and key. */

const PDF_HEAD = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // "%PDF-1.7"

describe("validateCvMetadata", () => {
  it("accepts a reasonable PDF and returns a sanitized filename and size", () => {
    const result = validateCvMetadata({ name: "Alex CV.pdf", type: "application/pdf", size: 2048 });
    expect(result).toEqual({ ok: true, filename: "Alex CV.pdf", size: 2048 });
  });

  it("rejects an empty file", () => {
    expect(validateCvMetadata({ name: "x.pdf", type: "application/pdf", size: 0 }).ok).toBe(false);
  });

  it("rejects a file over the 10 MB limit", () => {
    const result = validateCvMetadata({
      name: "big.pdf",
      type: "application/pdf",
      size: CV_MAX_BYTES + 1,
    });
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.message).toMatch(/10 MB/);
  });

  it("rejects a non-PDF content type", () => {
    const result = validateCvMetadata({ name: "r.docx", type: "application/msword", size: 100 });
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.message).toMatch(/Only PDF/);
  });
});

describe("hasPdfSignature", () => {
  it("accepts the %PDF- magic bytes", () => {
    expect(hasPdfSignature(PDF_HEAD)).toBe(true);
  });
  it("rejects other bytes (a renamed non-PDF)", () => {
    expect(hasPdfSignature(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]))).toBe(false); // a ZIP
    expect(hasPdfSignature(new Uint8Array([0x25]))).toBe(false); // too short
  });
});

describe("validateCvFile", () => {
  it("passes metadata plus a real signature", () => {
    expect(
      validateCvFile({ name: "cv.pdf", type: "application/pdf", size: 10 }, PDF_HEAD),
    ).toMatchObject({
      ok: true,
    });
  });
  it("fails a PDF content type whose bytes are not a PDF", () => {
    const result = validateCvFile(
      { name: "cv.pdf", type: "application/pdf", size: 10 },
      new Uint8Array([0, 1, 2, 3, 4]),
    );
    expect(result).toMatchObject({ ok: false });
  });
});

describe("sanitizeCvFilename", () => {
  it("strips any path and keeps a .pdf display name", () => {
    expect(sanitizeCvFilename("../../etc/passwd.pdf")).toBe("passwd.pdf");
    expect(sanitizeCvFilename("C:\\Users\\a\\Résumé final.pdf")).toBe("Rsum final.pdf");
  });
  it("removes control characters and caps length, always ending in .pdf", () => {
    expect(sanitizeCvFilename("a\u0000b.pdf")).toBe("ab.pdf");
    expect(sanitizeCvFilename("")).toBe("cv.pdf");
    expect(sanitizeCvFilename(null)).toBe("cv.pdf");
    expect(sanitizeCvFilename("x".repeat(300)).length).toBeLessThanOrEqual(124);
  });
});

describe("buildCvObjectKey", () => {
  it("contains only the organization id, candidate id and a random id — no personal data", () => {
    const key = buildCvObjectKey("org-uuid", "cand-uuid", "rand-uuid");
    expect(key).toBe("org-uuid/cand-uuid/rand-uuid.pdf");
    expect(key.split("/")[0]).toBe("org-uuid"); // first segment drives storage RLS
  });
});
