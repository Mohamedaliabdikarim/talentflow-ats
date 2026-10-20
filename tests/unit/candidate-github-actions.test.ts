import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeQuery } from "./helpers/fake-supabase";

/**
 * GitHub evidence authorization actions (ADR-038): authorization first, explicit confirmation and
 * basis, a profile URL must exist and be valid, audits with ids only, and revocation invalidates
 * GitHub-sourced insights after clearing consent.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

class AuthorizationError extends Error {
  readonly status = 403;
}
const state = {
  authorized: true,
  candidate: { id: "c1", github_url: "https://github.com/octocat" } as {
    id: string;
    github_url: string | null;
  } | null,
};
vi.mock("@/server/auth", () => ({
  AuthorizationError,
  requireOrgAccess: async () => {
    if (!state.authorized)
      throw new AuthorizationError("You do not have access to this organization");
    return { id: "org1", slug: "acme", userId: "u1" };
  },
}));
const recordAuditEvent = vi.fn(async () => {});
vi.mock("@/server/audit", () => ({ recordAuditEvent }));
const invalidateCandidateInsights = vi.fn(async () => 1);
vi.mock("@/server/insights/invalidate", () => ({ invalidateCandidateInsights }));

const updates: Record<string, unknown>[] = [];
function resolve(query: FakeQuery) {
  if (query.table === "candidates" && query.op === "select")
    return { data: state.candidate, error: null };
  if (query.table === "candidates" && query.op === "update") {
    updates.push(query.values as Record<string, unknown>);
    return { data: state.candidate ? { id: "c1" } : null, error: null };
  }
  return { data: null, error: null };
}
const fake = createFakeSupabase(resolve);
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => fake.client }));

const { authorizeCandidateGithubAiAction, revokeCandidateGithubAiAction } =
  await import("@/server/actions/candidate-github");

const idle = { status: "idle" } as const;

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  state.authorized = true;
  state.candidate = { id: "c1", github_url: "https://github.com/octocat" };
  updates.length = 0;
  recordAuditEvent.mockClear();
  invalidateCandidateInsights.mockClear();
});

describe("authorizeCandidateGithubAiAction", () => {
  it("refuses a caller without organization access before any query", async () => {
    state.authorized = false;
    const result = await authorizeCandidateGithubAiAction(
      "acme",
      "c1",
      idle,
      form({ confirm: "yes", basis: "x" }),
    );
    expect(result).toMatchObject({ status: "error", message: /do not have access/ });
    expect(updates).toHaveLength(0);
  });

  it("requires the explicit confirmation and a stated basis (never pre-checked)", async () => {
    const noConfirm = await authorizeCandidateGithubAiAction(
      "acme",
      "c1",
      idle,
      form({ basis: "Agreed in writing" }),
    );
    expect(noConfirm).toMatchObject({
      status: "error",
      fieldErrors: { confirm: expect.any(Array) },
    });
    const noBasis = await authorizeCandidateGithubAiAction(
      "acme",
      "c1",
      idle,
      form({ confirm: "yes" }),
    );
    expect(noBasis).toMatchObject({ status: "error", fieldErrors: { basis: expect.any(Array) } });
    expect(updates).toHaveLength(0);
  });

  it("refuses when there is no GitHub URL on file", async () => {
    state.candidate = { id: "c1", github_url: null };
    const result = await authorizeCandidateGithubAiAction(
      "acme",
      "c1",
      idle,
      form({ confirm: "yes", basis: "Agreed" }),
    );
    expect(result).toMatchObject({ status: "error", message: /Add a GitHub profile URL/ });
    expect(updates).toHaveLength(0);
  });

  it("refuses when the stored URL is not a profile URL (exact profile only)", async () => {
    state.candidate = { id: "c1", github_url: "https://github.com/octocat/some-repo" };
    const result = await authorizeCandidateGithubAiAction(
      "acme",
      "c1",
      idle,
      form({ confirm: "yes", basis: "Agreed" }),
    );
    expect(result).toMatchObject({ status: "error", message: /not a profile URL/ });
    expect(updates).toHaveLength(0);
  });

  it("records who, when and the basis, and audits with ids only", async () => {
    const result = await authorizeCandidateGithubAiAction(
      "acme",
      "c1",
      idle,
      form({ confirm: "yes", basis: "Candidate listed the profile" }),
    );
    expect(result).toMatchObject({ status: "success", message: "GitHub evidence authorized." });
    expect(updates[0]).toMatchObject({
      github_ai_authorized: true,
      github_ai_authorized_by: "u1",
      github_ai_authorization_basis: "Candidate listed the profile",
    });
    expect(typeof updates[0]!.github_ai_authorized_at).toBe("string");
    expect(recordAuditEvent).toHaveBeenCalledWith("candidate.github_ai_authorized", {
      organizationId: "org1",
      targetType: "candidate",
      targetId: "c1",
    });
    expect(JSON.stringify(recordAuditEvent.mock.calls)).not.toContain("octocat");
  });

  it("uses the same copy for hidden and missing candidates", async () => {
    state.candidate = null;
    const result = await authorizeCandidateGithubAiAction(
      "acme",
      "c1",
      idle,
      form({ confirm: "yes", basis: "Agreed" }),
    );
    expect(result).toMatchObject({ status: "error", message: "This candidate no longer exists." });
  });
});

describe("revokeCandidateGithubAiAction", () => {
  it("clears the authorization first, then invalidates GitHub-sourced insights, then audits", async () => {
    const result = await revokeCandidateGithubAiAction("acme", "c1", idle, new FormData());
    expect(result).toMatchObject({ status: "success", message: "GitHub authorization revoked." });
    expect(updates[0]).toEqual({
      github_ai_authorized: false,
      github_ai_authorized_at: null,
      github_ai_authorized_by: null,
      github_ai_authorization_basis: null,
    });
    expect(invalidateCandidateInsights).toHaveBeenCalledWith(
      expect.anything(),
      "org1",
      "c1",
      "github_revoked",
    );
    expect(recordAuditEvent).toHaveBeenCalledWith(
      "candidate.github_ai_revoked",
      expect.any(Object),
    );
  });

  it("does not invalidate anything when the candidate does not exist", async () => {
    state.candidate = null;
    const result = await revokeCandidateGithubAiAction("acme", "c1", idle, new FormData());
    expect(result.status).toBe("error");
    expect(invalidateCandidateInsights).not.toHaveBeenCalled();
  });
});
