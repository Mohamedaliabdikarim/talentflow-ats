import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeQuery, findFilter } from "./helpers/fake-supabase";

/**
 * Revocation scope (ADR-037/038 §8.3): CV reasons clear every insight of the candidate, GitHub
 * reasons only those whose evidence_sources contain "github"; content is cleared; the audit
 * carries reason and count only.
 */

vi.mock("server-only", () => ({}));
const recordAuditEvent = vi.fn(async () => {});
vi.mock("@/server/audit", () => ({ recordAuditEvent }));

const { invalidateCandidateInsights } = await import("@/server/insights/invalidate");

const state = { matched: 2 };
const updates: FakeQuery[] = [];

function resolve(query: FakeQuery) {
  updates.push(query);
  return {
    data: Array.from({ length: state.matched }, (_, i) => ({ id: `ins-${i}` })),
    error: null,
  };
}

beforeEach(() => {
  state.matched = 2;
  updates.length = 0;
  recordAuditEvent.mockClear();
});

describe("invalidateCandidateInsights", () => {
  it.each(["authorization_revoked", "cv_deleted"] as const)(
    "%s clears every non-revoked insight of the candidate, tenant-scoped",
    async (reason) => {
      const { client } = createFakeSupabase(resolve);
      const count = await invalidateCandidateInsights(client as never, "org-1", "cand-1", reason);
      expect(count).toBe(2);
      const query = updates[0]!;
      expect(query.op).toBe("update");
      expect(query.values).toMatchObject({ status: "revoked", result: null, summary: null });
      expect(findFilter(query, "candidate_id")?.value).toBe("cand-1");
      expect(findFilter(query, "organization_id")?.value).toBe("org-1");
      expect(findFilter(query, "status", "neq")?.value).toBe("revoked");
      expect(findFilter(query, "evidence_sources", "contains")).toBeUndefined();
    },
  );

  it.each(["github_revoked", "github_url_changed"] as const)(
    "%s clears only insights whose evidence_sources contain github",
    async (reason) => {
      const { client } = createFakeSupabase(resolve);
      await invalidateCandidateInsights(client as never, "org-1", "cand-1", reason);
      const query = updates[0]!;
      expect(findFilter(query, "evidence_sources", "contains")?.value).toEqual(["github"]);
      expect(findFilter(query, "organization_id")?.value).toBe("org-1");
      expect((query.values as Record<string, unknown>).error_message).toMatch(/GitHub/);
    },
  );

  it("audits the reason and count with ids only, and not at all when nothing matched", async () => {
    const { client } = createFakeSupabase(resolve);
    await invalidateCandidateInsights(client as never, "org-1", "cand-1", "github_revoked");
    expect(recordAuditEvent).toHaveBeenCalledWith("candidate.ai_insights_invalidated", {
      organizationId: "org-1",
      targetType: "candidate",
      targetId: "cand-1",
      metadata: { reason: "github_revoked", count: 2 },
    });
    recordAuditEvent.mockClear();
    state.matched = 0;
    expect(
      await invalidateCandidateInsights(client as never, "org-1", "cand-1", "github_revoked"),
    ).toBe(0);
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });
});
