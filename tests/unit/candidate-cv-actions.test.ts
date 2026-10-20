import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CV server actions (ADR-033): authorization first, PDF validation, consent reset on a new
 * CV, audit events, and compensation on partial failure. A fake Supabase client records the
 * storage and table calls; nothing touches a real project.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

class AuthorizationError extends Error {
  readonly status = 403;
  constructor(message = "") {
    super(message);
    this.name = "AuthorizationError";
  }
}

const state = {
  authorized: true,
  candidate: { id: "c1", cv_object_key: null as string | null } as {
    id: string;
    cv_object_key: string | null;
  } | null,
  uploadError: null as { message: string } | null,
  updateError: null as { message: string } | null,
  updateReturnsNull: false,
};

const calls = {
  uploads: [] as Array<{ key: string }>,
  removes: [] as string[],
  updates: [] as Record<string, unknown>[],
};

const recordAuditEvent = vi.fn(async () => {});

vi.mock("@/server/auth", () => ({
  AuthorizationError,
  requireOrgAccess: async () => {
    if (!state.authorized)
      throw new AuthorizationError("You do not have access to this organization");
    return { id: "org1", slug: "acme", userId: "u1" };
  },
}));
vi.mock("@/server/audit", () => ({ recordAuditEvent }));
// Revocation behaviour (ADR-037) is covered by its own tests; here we assert it is invoked.
const invalidateCandidateInsights = vi.fn(async () => 0);
vi.mock("@/server/insights/invalidate", () => ({ invalidateCandidateInsights }));

function maybeSingle<T>(value: T) {
  return { maybeSingle: async () => value };
}

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => maybeSingle({ data: state.candidate, error: null }) }),
      }),
      update: (values: Record<string, unknown>) => {
        calls.updates.push(values);
        return {
          eq: () => ({
            eq: () => ({
              select: () =>
                maybeSingle({
                  data: state.updateReturnsNull ? null : { id: "c1" },
                  error: state.updateError,
                }),
            }),
          }),
        };
      },
    }),
    storage: {
      from: () => ({
        upload: async (key: string) => {
          calls.uploads.push({ key });
          return { error: state.uploadError };
        },
        remove: async (keys: string[]) => {
          calls.removes.push(...keys);
          return { error: null };
        },
      }),
    },
  }),
}));

const {
  uploadCandidateCvAction,
  deleteCandidateCvAction,
  authorizeCandidateCvAiAction,
  revokeCandidateCvAiAction,
} = await import("@/server/actions/candidate-cv");

const idle = { status: "idle" } as const;
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7

function pdfForm(bytes: Uint8Array = PDF, type = "application/pdf", name = "cv.pdf"): FormData {
  const fd = new FormData();
  // new Uint8Array(bytes) yields an ArrayBuffer-backed view, which File accepts as a BlobPart.
  fd.set("cv", new File([new Uint8Array(bytes)], name, { type }));
  return fd;
}

beforeEach(() => {
  state.authorized = true;
  state.candidate = { id: "c1", cv_object_key: null };
  state.uploadError = null;
  state.updateError = null;
  state.updateReturnsNull = false;
  calls.uploads.length = 0;
  calls.removes.length = 0;
  calls.updates.length = 0;
  recordAuditEvent.mockClear();
  invalidateCandidateInsights.mockClear();
});

describe("uploadCandidateCvAction", () => {
  it("refuses a caller without organization access before touching storage", async () => {
    state.authorized = false;
    const result = await uploadCandidateCvAction("acme", "c1", idle, pdfForm());
    expect(result).toMatchObject({ status: "error", message: /do not have access/ });
    expect(calls.uploads).toHaveLength(0);
  });

  it("rejects a non-PDF content type before uploading", async () => {
    const result = await uploadCandidateCvAction("acme", "c1", idle, pdfForm(PDF, "text/plain"));
    expect(result.status).toBe("error");
    expect(calls.uploads).toHaveLength(0);
  });

  it("rejects a file whose bytes are not a real PDF", async () => {
    const result = await uploadCandidateCvAction(
      "acme",
      "c1",
      idle,
      pdfForm(new Uint8Array([0x50, 0x4b, 0x03, 0x04])),
    );
    expect(result.status).toBe("error");
    expect(calls.uploads).toHaveLength(0);
  });

  it("uploads a new CV, resets AI authorization, and audits an upload", async () => {
    const result = await uploadCandidateCvAction("acme", "c1", idle, pdfForm());
    expect(result).toMatchObject({ status: "success", message: "CV uploaded." });
    expect(calls.uploads).toHaveLength(1);
    expect(calls.updates[0]).toMatchObject({
      cv_source: "candidate_provided_recruiter_upload",
      cv_ai_authorized: false,
      cv_ai_authorized_at: null,
      cv_ai_authorization_basis: null,
    });
    expect(recordAuditEvent).toHaveBeenCalledWith("candidate.cv_uploaded", expect.any(Object));
  });

  it("replaces an existing CV: audits a replace and removes the old object", async () => {
    state.candidate = { id: "c1", cv_object_key: "org1/c1/old.pdf" };
    const result = await uploadCandidateCvAction("acme", "c1", idle, pdfForm());
    expect(result).toMatchObject({ status: "success", message: "CV replaced." });
    expect(recordAuditEvent).toHaveBeenCalledWith("candidate.cv_replaced", expect.any(Object));
    expect(calls.removes).toContain("org1/c1/old.pdf");
  });

  it("compensates by removing the new object when the metadata update fails", async () => {
    state.updateError = { message: "db down" };
    await expect(uploadCandidateCvAction("acme", "c1", idle, pdfForm())).resolves.toMatchObject({
      status: "error",
    });
    // The just-uploaded object was removed; no orphan, no audit.
    expect(calls.uploads).toHaveLength(1);
    expect(calls.removes).toHaveLength(1);
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });
});

describe("deleteCandidateCvAction", () => {
  it("errors when there is no CV", async () => {
    state.candidate = { id: "c1", cv_object_key: null };
    const result = await deleteCandidateCvAction("acme", "c1", idle, new FormData());
    expect(result).toMatchObject({ status: "error", message: /no CV/ });
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("clears the metadata, removes the object, and audits a delete", async () => {
    state.candidate = { id: "c1", cv_object_key: "org1/c1/x.pdf" };
    const result = await deleteCandidateCvAction("acme", "c1", idle, new FormData());
    expect(result).toMatchObject({ status: "success", message: "CV deleted." });
    expect(calls.updates[0]).toMatchObject({ cv_object_key: null, cv_ai_authorized: false });
    expect(calls.removes).toContain("org1/c1/x.pdf");
    expect(recordAuditEvent).toHaveBeenCalledWith("candidate.cv_deleted", expect.any(Object));
  });

  it("invalidates AI insights derived from the deleted CV (ADR-037)", async () => {
    state.candidate = { id: "c1", cv_object_key: "org1/c1/x.pdf" };
    await deleteCandidateCvAction("acme", "c1", idle, new FormData());
    expect(invalidateCandidateInsights).toHaveBeenCalledWith(
      expect.anything(),
      "org1",
      "c1",
      "cv_deleted",
    );
  });

  it("does not touch insights when there was no CV to delete", async () => {
    state.candidate = { id: "c1", cv_object_key: null };
    await deleteCandidateCvAction("acme", "c1", idle, new FormData());
    expect(invalidateCandidateInsights).not.toHaveBeenCalled();
  });
});

describe("authorizeCandidateCvAiAction", () => {
  function consentForm(confirm: boolean, basis: string): FormData {
    const fd = new FormData();
    if (confirm) fd.set("confirm", "yes");
    fd.set("basis", basis);
    return fd;
  }

  it("requires the explicit confirmation checkbox", async () => {
    state.candidate = { id: "c1", cv_object_key: "org1/c1/x.pdf" };
    const result = await authorizeCandidateCvAiAction(
      "acme",
      "c1",
      idle,
      consentForm(false, "emailed consent"),
    );
    expect(result.status).toBe("error");
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("requires a stated basis", async () => {
    state.candidate = { id: "c1", cv_object_key: "org1/c1/x.pdf" };
    const result = await authorizeCandidateCvAiAction("acme", "c1", idle, consentForm(true, ""));
    expect(result.status).toBe("error");
  });

  it("refuses authorization when there is no CV", async () => {
    state.candidate = { id: "c1", cv_object_key: null };
    const result = await authorizeCandidateCvAiAction(
      "acme",
      "c1",
      idle,
      consentForm(true, "emailed consent"),
    );
    expect(result).toMatchObject({ status: "error", message: /Upload a CV/ });
  });

  it("records authorization with who/when/basis and audits it", async () => {
    state.candidate = { id: "c1", cv_object_key: "org1/c1/x.pdf" };
    const result = await authorizeCandidateCvAiAction(
      "acme",
      "c1",
      idle,
      consentForm(true, "candidate emailed written consent"),
    );
    expect(result).toMatchObject({ status: "success" });
    expect(calls.updates[0]).toMatchObject({
      cv_ai_authorized: true,
      cv_ai_authorized_by: "u1",
      cv_ai_authorization_basis: "candidate emailed written consent",
    });
    expect(recordAuditEvent).toHaveBeenCalledWith("candidate.cv_ai_authorized", expect.any(Object));
  });
});

describe("revokeCandidateCvAiAction", () => {
  it("clears authorization and audits a revoke", async () => {
    const result = await revokeCandidateCvAiAction("acme", "c1", idle, new FormData());
    expect(result).toMatchObject({ status: "success" });
    expect(calls.updates[0]).toMatchObject({ cv_ai_authorized: false, cv_ai_authorized_by: null });
    expect(recordAuditEvent).toHaveBeenCalledWith("candidate.cv_ai_revoked", expect.any(Object));
  });

  it("invalidates every AI insight of the candidate after revoking (ADR-037)", async () => {
    await revokeCandidateCvAiAction("acme", "c1", idle, new FormData());
    expect(invalidateCandidateInsights).toHaveBeenCalledWith(
      expect.anything(),
      "org1",
      "c1",
      "authorization_revoked",
    );
    // Consent is cleared before the insights are invalidated, so a run that re-checks consent
    // at that instant already sees it withdrawn.
    const consentCleared = calls.updates.findIndex((u) => u.cv_ai_authorized === false);
    expect(consentCleared).toBe(0);
  });

  it("does not invalidate insights when the candidate does not exist", async () => {
    state.updateReturnsNull = true;
    const result = await revokeCandidateCvAiAction("acme", "c1", idle, new FormData());
    expect(result.status).toBe("error");
    expect(invalidateCandidateInsights).not.toHaveBeenCalled();
  });
});
