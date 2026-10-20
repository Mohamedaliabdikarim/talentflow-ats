import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CV detail extraction action (ADR-039): authorization first, upload-grade file validation,
 * explicit "not configured" fallback, sanitised results, content-free failures, and an audit
 * row with counts only. Azure and the PDF reader are mocked.
 */

vi.mock("server-only", () => ({}));

class AuthorizationError extends Error {
  readonly status = 403;
}
const state = { authorized: true, configured: true };
vi.mock("@/server/auth", () => ({
  AuthorizationError,
  requireOrgAccess: async () => {
    if (!state.authorized)
      throw new AuthorizationError("You do not have access to this organization");
    return { id: "org-1", slug: "acme", userId: "u1" };
  },
}));
const recordAuditEvent = vi.fn(async () => {});
vi.mock("@/server/audit", () => ({ recordAuditEvent }));

class AiError extends Error {
  constructor(
    readonly kind: string,
    message: string,
  ) {
    super(message);
    this.name = "AiError";
  }
}
vi.mock("@/lib/ai/client", () => ({ AiError, isAzureOpenAIConfigured: () => state.configured }));

class InsightRunError extends Error {}
const extractCvText = vi.fn(async () => "Alex Example alex@example.test CV-PRIVATE-MARKER");
vi.mock("@/lib/ai/job-match", () => ({ InsightRunError, extractCvText }));

const extractCandidateDetails = vi.fn();
vi.mock("@/lib/ai/candidate-extract", () => ({ extractCandidateDetails }));

const { extractCandidateDetailsAction } = await import("@/server/actions/candidate-extract");
const { EXTRACTION_NOT_CONFIGURED_MESSAGE } = await import("@/lib/ai/candidate-extract-contract");

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
function form(bytes: Uint8Array = PDF, type = "application/pdf", name = "cv.pdf"): FormData {
  const fd = new FormData();
  fd.set("cv", new File([new Uint8Array(bytes)], name, { type }));
  return fd;
}

beforeEach(() => {
  state.authorized = true;
  state.configured = true;
  recordAuditEvent.mockClear();
  extractCvText.mockClear();
  extractCandidateDetails.mockReset();
  extractCandidateDetails.mockResolvedValue({
    values: { fullName: "Alex Example", email: "alex@example.test" },
    warnings: ["A GitHub link in the CV was not a profile URL and was left empty."],
    model: "gpt-5-mini",
    promptVersion: "p",
    contractVersion: "candidate-profile-extract-v1",
  });
});

describe("extractCandidateDetailsAction", () => {
  it("refuses a caller without organization access before reading the file", async () => {
    state.authorized = false;
    const result = await extractCandidateDetailsAction("acme", form());
    expect(result).toMatchObject({ status: "error", message: /do not have access/ });
    expect(extractCvText).not.toHaveBeenCalled();
  });

  it("requires a file, a PDF content type and the PDF signature", async () => {
    expect(await extractCandidateDetailsAction("acme", new FormData())).toMatchObject({
      status: "error",
      fieldErrors: { cv: ["Choose a PDF file"] },
    });
    expect(await extractCandidateDetailsAction("acme", form(PDF, "text/plain"))).toMatchObject({
      status: "error",
    });
    expect(
      await extractCandidateDetailsAction("acme", form(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))),
    ).toMatchObject({ status: "error", fieldErrors: { cv: ["Not a valid PDF"] } });
    expect(extractCandidateDetails).not.toHaveBeenCalled();
  });

  it("falls back to manual entry with an explicit message when AI is not configured", async () => {
    state.configured = false;
    const result = await extractCandidateDetailsAction("acme", form());
    expect(result).toEqual({
      status: "error",
      message: EXTRACTION_NOT_CONFIGURED_MESSAGE,
      fieldErrors: undefined,
      values: undefined,
    });
    expect(extractCvText).not.toHaveBeenCalled();
  });

  it("returns the sanitised values and warnings, and audits counts only", async () => {
    const result = await extractCandidateDetailsAction("acme", form());
    expect(result).toMatchObject({
      status: "success",
      message: /Review and correct/,
      data: {
        values: { fullName: "Alex Example", email: "alex@example.test" },
        warnings: [expect.stringMatching(/GitHub link/)],
      },
    });
    expect(extractCandidateDetails).toHaveBeenCalledWith(
      expect.stringContaining("CV-PRIVATE-MARKER"),
    );
    expect(recordAuditEvent).toHaveBeenCalledWith("candidate.cv_details_extracted", {
      organizationId: "org-1",
      targetType: "candidate_draft",
      metadata: { fields: 2, warnings: 1, model: "gpt-5-mini" },
    });
    expect(JSON.stringify(recordAuditEvent.mock.calls)).not.toMatch(/Alex|example\.test|MARKER/);
  });

  it("says so when nothing was found, without an error", async () => {
    extractCandidateDetails.mockResolvedValue({
      values: {},
      warnings: [],
      model: "m",
      promptVersion: "p",
      contractVersion: "c",
    });
    const result = await extractCandidateDetailsAction("acme", form());
    expect(result).toMatchObject({ status: "success", message: /No contact details were found/ });
  });

  it("turns AI and content failures into content-free error states", async () => {
    extractCandidateDetails.mockRejectedValueOnce(
      new AiError("timeout", "Azure OpenAI request timed out."),
    );
    expect(await extractCandidateDetailsAction("acme", form())).toMatchObject({
      status: "error",
      message: "Could not extract details from the CV: Azure OpenAI request timed out.",
    });
    extractCvText.mockRejectedValueOnce(new InsightRunError("The CV could not be read as a PDF."));
    expect(await extractCandidateDetailsAction("acme", form())).toMatchObject({
      status: "error",
      message: /could not be read as a PDF/,
    });
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("maps unexpected errors to the generic action message", async () => {
    extractCandidateDetails.mockRejectedValueOnce(new Error("stack with CV-PRIVATE-MARKER"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await extractCandidateDetailsAction("acme", form());
    expect(result).toMatchObject({
      status: "error",
      message: "Something went wrong. Please try again.",
    });
    errors.mockRestore();
  });
});
