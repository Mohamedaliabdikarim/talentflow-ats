import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeQuery } from "./helpers/fake-supabase";

/**
 * Stage-move trigger (ADR-035 §1): Candidate Insights are queued on New → Screening only, and
 * the stage transition always stands even when queueing fails.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

class AuthorizationError extends Error {
  readonly status = 403;
}
vi.mock("@/server/auth", () => ({
  AuthorizationError,
  requireOrgAccess: async () => ({ id: "org-1", slug: "acme", userId: "user-1" }),
}));

const enqueueJobMatchInsight = vi.fn(async () => ({ outcome: "enqueued", insightId: "i1" }));
vi.mock("@/server/insights/queue", () => ({ enqueueJobMatchInsight }));

const APP_ID = "0f7c2e0a-6b1e-4a6a-9d1b-3f2d6a5c8e10";
const state = { currentStage: "new" as string | null };
const updates: unknown[] = [];

function resolve(query: FakeQuery) {
  if (query.table === "applications" && query.op === "select") {
    return { data: state.currentStage ? { stage: state.currentStage } : null, error: null };
  }
  if (query.table === "applications" && query.op === "update") {
    updates.push(query.values);
    return { data: { id: APP_ID }, error: null };
  }
  return { data: null, error: null };
}

const fake = createFakeSupabase(resolve);
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => fake.client }));

const { moveApplicationStageAction } = await import("@/server/actions/applications");

beforeEach(() => {
  state.currentStage = "new";
  updates.length = 0;
  enqueueJobMatchInsight.mockClear();
  enqueueJobMatchInsight.mockResolvedValue({ outcome: "enqueued", insightId: "i1" });
});

describe("moveApplicationStageAction × Candidate Insights", () => {
  it("queues an analysis when an application moves from New to Screening", async () => {
    const result = await moveApplicationStageAction("acme", {
      applicationId: APP_ID,
      stage: "screening",
    });
    expect(result).toMatchObject({ status: "success", message: "Moved to Screening" });
    expect(updates).toEqual([{ stage: "screening" }]);
    expect(enqueueJobMatchInsight).toHaveBeenCalledTimes(1);
    expect(enqueueJobMatchInsight).toHaveBeenCalledWith(
      expect.objectContaining({ applicationId: APP_ID }),
    );
  });

  it.each([
    ["screening", "interview"],
    ["new", "interview"],
    ["interview", "screening"],
    ["rejected", "screening"],
    ["new", "rejected"],
  ])("does not queue for %s → %s", async (from, to) => {
    state.currentStage = from;
    const result = await moveApplicationStageAction("acme", { applicationId: APP_ID, stage: to });
    expect(result.status).toBe("success");
    expect(enqueueJobMatchInsight).not.toHaveBeenCalled();
  });

  it("preserves the stage change when queueing throws", async () => {
    enqueueJobMatchInsight.mockRejectedValueOnce(new Error("queue down"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await moveApplicationStageAction("acme", {
      applicationId: APP_ID,
      stage: "screening",
    });
    expect(result).toMatchObject({ status: "success", message: "Moved to Screening" });
    expect(updates).toEqual([{ stage: "screening" }]);
    expect(errors).toHaveBeenCalledWith(expect.stringMatching(/could not queue analysis/));
    errors.mockRestore();
  });

  it("does not queue when the candidate lacks authorization (no row, no error for the move)", async () => {
    enqueueJobMatchInsight.mockResolvedValueOnce({ outcome: "authorization_required" } as never);
    const result = await moveApplicationStageAction("acme", {
      applicationId: APP_ID,
      stage: "screening",
    });
    expect(result.status).toBe("success");
  });

  it("rejects an unknown stage before touching the database", async () => {
    const result = await moveApplicationStageAction("acme", {
      applicationId: APP_ID,
      stage: "bogus",
    });
    expect(result).toMatchObject({ status: "error", message: "Unknown stage" });
    expect(updates).toHaveLength(0);
    expect(enqueueJobMatchInsight).not.toHaveBeenCalled();
  });

  it("reports a missing application without queueing", async () => {
    state.currentStage = null;
    const result = await moveApplicationStageAction("acme", {
      applicationId: APP_ID,
      stage: "screening",
    });
    expect(result).toMatchObject({ status: "error", message: /no longer exists/ });
    expect(enqueueJobMatchInsight).not.toHaveBeenCalled();
  });
});
