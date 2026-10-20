import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeQuery } from "./helpers/fake-supabase";

/**
 * Editing a candidate's GitHub URL (ADR-038 §8.1): an authorization covers one exact profile, so
 * changing or removing the URL resets it and invalidates GitHub-sourced insights; an unchanged
 * URL leaves both alone.
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
}
vi.mock("@/server/auth", () => ({
  AuthorizationError,
  requireOrgAccess: async () => ({ id: "org1", slug: "acme", userId: "u1" }),
}));
const recordAuditEvent = vi.fn(async () => {});
vi.mock("@/server/audit", () => ({ recordAuditEvent }));
const invalidateCandidateInsights = vi.fn(async () => 1);
vi.mock("@/server/insights/invalidate", () => ({ invalidateCandidateInsights }));

const state = { currentUrl: "https://github.com/octocat" as string | null, authorized: true };
const updates: Record<string, unknown>[] = [];
function resolve(query: FakeQuery) {
  if (query.table === "candidates" && query.op === "select") {
    return {
      data: { github_url: state.currentUrl, github_ai_authorized: state.authorized },
      error: null,
    };
  }
  if (query.table === "candidates" && query.op === "update") {
    updates.push(query.values as Record<string, unknown>);
    return { data: { id: "c1" }, error: null };
  }
  return { data: null, error: null };
}
const fake = createFakeSupabase(resolve);
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => fake.client }));

const { updateCandidateAction } = await import("@/server/actions/candidates");

function form(githubUrl: string): FormData {
  const fd = new FormData();
  fd.set("fullName", "Alex Example");
  fd.set("githubUrl", githubUrl);
  return fd;
}

const RESET = {
  github_ai_authorized: false,
  github_ai_authorized_at: null,
  github_ai_authorized_by: null,
  github_ai_authorization_basis: null,
};

beforeEach(() => {
  state.currentUrl = "https://github.com/octocat";
  state.authorized = true;
  updates.length = 0;
  recordAuditEvent.mockClear();
  invalidateCandidateInsights.mockClear();
});

describe("updateCandidateAction × GitHub authorization", () => {
  it("resets the authorization and invalidates GitHub-sourced insights when the URL changes", async () => {
    await expect(
      updateCandidateAction(
        "acme",
        "c1",
        { status: "idle" },
        form("https://github.com/someone-else"),
      ),
    ).rejects.toThrow("REDIRECT:/o/acme/candidates/c1");
    expect(updates[0]).toMatchObject({ github_url: "https://github.com/someone-else", ...RESET });
    expect(invalidateCandidateInsights).toHaveBeenCalledWith(
      expect.anything(),
      "org1",
      "c1",
      "github_url_changed",
    );
    expect(recordAuditEvent).toHaveBeenCalledWith("candidate.github_ai_revoked", {
      organizationId: "org1",
      targetType: "candidate",
      targetId: "c1",
      metadata: { reason: "url_changed" },
    });
  });

  it("resets and invalidates when the URL is removed", async () => {
    await expect(updateCandidateAction("acme", "c1", { status: "idle" }, form(""))).rejects.toThrow(
      /REDIRECT/,
    );
    expect(updates[0]).toMatchObject({ github_url: null, ...RESET });
    expect(invalidateCandidateInsights).toHaveBeenCalledTimes(1);
  });

  it("leaves the authorization and insights alone when the URL is unchanged", async () => {
    await expect(
      updateCandidateAction("acme", "c1", { status: "idle" }, form("https://github.com/octocat")),
    ).rejects.toThrow(/REDIRECT/);
    expect(updates[0]).not.toHaveProperty("github_ai_authorized");
    expect(invalidateCandidateInsights).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("resets the columns but has nothing to invalidate when the profile was never authorized", async () => {
    state.authorized = false;
    await expect(
      updateCandidateAction(
        "acme",
        "c1",
        { status: "idle" },
        form("https://github.com/someone-else"),
      ),
    ).rejects.toThrow(/REDIRECT/);
    expect(updates[0]).toMatchObject(RESET);
    expect(invalidateCandidateInsights).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("still rejects a repository or non-GitHub URL at validation (no reset, no query)", async () => {
    const result = await updateCandidateAction(
      "acme",
      "c1",
      { status: "idle" },
      form("https://github.com/octocat/repo"),
    );
    expect(result).toMatchObject({
      status: "error",
      fieldErrors: { githubUrl: expect.any(Array) },
    });
    expect(updates).toHaveLength(0);
  });
});
