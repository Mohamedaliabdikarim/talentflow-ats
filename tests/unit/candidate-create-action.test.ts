import { beforeEach, describe, expect, it, vi } from "vitest";
import { NO_JOB_OPTION } from "@/lib/validation/candidate";

/**
 * createCandidateAction regression (the "No job yet" failure): "none" and empty create a
 * candidate with no application; a real in-org job creates the application; a UUID not in the
 * org is rejected; an optional PDF is stored; and a validation error echoes the typed values.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith("REDIRECT:")) throw error;
  },
}));

class AuthorizationError extends Error {
  readonly status = 403;
  constructor(message = "") {
    super(message);
    this.name = "AuthorizationError";
  }
}
vi.mock("@/server/auth", () => ({
  AuthorizationError,
  requireOrgAccess: async () => ({ id: "org1", slug: "acme", userId: "u1" }),
}));

const recordAuditEvent = vi.fn(async () => {});
vi.mock("@/server/audit", () => ({ recordAuditEvent }));

const state = { jobExists: true };
const calls = {
  jobChecks: 0,
  candidateInserts: [] as Record<string, unknown>[],
  applicationInserts: [] as Record<string, unknown>[],
  candidateUpdates: [] as Record<string, unknown>[],
  uploads: [] as string[],
  deletes: 0,
};

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    from: (table: string) => {
      if (table === "jobs") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => {
                  calls.jobChecks += 1;
                  return { data: state.jobExists ? { id: "job1" } : null, error: null };
                },
              }),
            }),
          }),
        };
      }
      if (table === "candidates") {
        return {
          insert: (values: Record<string, unknown>) => {
            calls.candidateInserts.push(values);
            return {
              select: () => ({ single: async () => ({ data: { id: "cand1" }, error: null }) }),
            };
          },
          update: (values: Record<string, unknown>) => {
            calls.candidateUpdates.push(values);
            return { eq: () => ({ eq: async () => ({ error: null }) }) };
          },
          delete: () => ({
            eq: () => ({
              eq: async () => {
                calls.deletes += 1;
                return { error: null };
              },
            }),
          }),
        };
      }
      return {
        insert: async (values: Record<string, unknown>) => {
          calls.applicationInserts.push(values);
          return { error: null };
        },
      };
    },
    storage: {
      from: () => ({
        upload: async (key: string) => {
          calls.uploads.push(key);
          return { error: null };
        },
        remove: async () => ({ error: null }),
      }),
    },
  }),
}));

const { createCandidateAction } = await import("@/server/actions/candidates");

const idle = { status: "idle" } as const;

function form(entries: Record<string, string>, pdf?: boolean): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  if (pdf) {
    fd.set(
      "cv",
      new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])], "cv.pdf", {
        type: "application/pdf",
      }),
    );
  }
  return fd;
}

beforeEach(() => {
  state.jobExists = true;
  calls.jobChecks = 0;
  calls.candidateInserts.length = 0;
  calls.applicationInserts.length = 0;
  calls.candidateUpdates.length = 0;
  calls.uploads.length = 0;
  calls.deletes = 0;
  recordAuditEvent.mockClear();
});

describe("createCandidateAction — job selection", () => {
  it("creates the candidate with NO application when 'No job yet' is selected", async () => {
    await expect(
      createCandidateAction("acme", idle, form({ fullName: "CV Test", jobId: NO_JOB_OPTION })),
    ).rejects.toThrow("REDIRECT:/o/acme/candidates/cand1");
    expect(calls.candidateInserts).toHaveLength(1);
    expect(calls.jobChecks).toBe(0);
    expect(calls.applicationInserts).toHaveLength(0);
  });

  it("treats an empty job value the same as no job", async () => {
    await expect(
      createCandidateAction("acme", idle, form({ fullName: "CV Test", jobId: "" })),
    ).rejects.toThrow("REDIRECT:");
    expect(calls.applicationInserts).toHaveLength(0);
  });

  it("creates an application when a real in-org job is selected", async () => {
    await expect(
      createCandidateAction(
        "acme",
        idle,
        form({ fullName: "CV Test", jobId: "33333333-3333-4333-8333-333333333333" }),
      ),
    ).rejects.toThrow("REDIRECT:");
    expect(calls.jobChecks).toBe(1);
    expect(calls.applicationInserts).toHaveLength(1);
    expect(calls.applicationInserts[0]).toMatchObject({
      job_id: "33333333-3333-4333-8333-333333333333",
    });
  });

  it("rejects a valid-format job id that is not in the organization, creating nothing", async () => {
    state.jobExists = false;
    const result = await createCandidateAction(
      "acme",
      idle,
      form({ fullName: "CV Test", jobId: "44444444-4444-4444-8444-444444444444" }),
    );
    expect(result).toMatchObject({ status: "error", fieldErrors: { jobId: expect.any(Array) } });
    expect(calls.candidateInserts).toHaveLength(0);
  });
});

describe("createCandidateAction — PDF and data preservation", () => {
  it("stores an attached PDF and audits an upload when no job is selected", async () => {
    await expect(
      createCandidateAction(
        "acme",
        idle,
        form({ fullName: "CV Test", jobId: NO_JOB_OPTION }, true),
      ),
    ).rejects.toThrow("REDIRECT:");
    expect(calls.uploads).toHaveLength(1);
    expect(calls.candidateUpdates[0]).toMatchObject({
      cv_source: "candidate_provided_recruiter_upload",
    });
    expect(recordAuditEvent).toHaveBeenCalledWith("candidate.cv_uploaded", expect.any(Object));
  });

  it("echoes the typed values on a validation error so the form can repopulate", async () => {
    const result = await createCandidateAction(
      "acme",
      idle,
      form({ fullName: "A", email: "me@example.test", jobId: NO_JOB_OPTION }),
    );
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.values?.fullName).toBe("A");
      expect(result.values?.email).toBe("me@example.test");
      expect(result.values?.jobId).toBe(NO_JOB_OPTION);
    }
  });
});
