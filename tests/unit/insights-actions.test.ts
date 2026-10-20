import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Candidate Insights Server Actions (ADR-035): authorization first, outcome mapping, and the
 * polling read. Queueing itself is covered by insights-queue.test.ts.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

class AuthorizationError extends Error {
  readonly status = 403;
}
const state = { authorized: true };
vi.mock("@/server/auth", () => ({
  AuthorizationError,
  requireOrgAccess: async () => {
    if (!state.authorized)
      throw new AuthorizationError("You do not have access to this organization");
    return { id: "org-1", slug: "acme", userId: "user-1" };
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({}) }));

const enqueueJobMatchInsight = vi.fn();
vi.mock("@/server/insights/queue", () => ({ enqueueJobMatchInsight }));

const getLatestApplicationInsight = vi.fn();
vi.mock("@/server/data/insights", () => ({ getLatestApplicationInsight }));

const { generateApplicationInsightsAction, getApplicationInsightAction } =
  await import("@/server/actions/insights");

const APP_ID = "0f7c2e0a-6b1e-4a6a-9d1b-3f2d6a5c8e10";

beforeEach(() => {
  state.authorized = true;
  enqueueJobMatchInsight.mockReset();
  getLatestApplicationInsight.mockReset();
});

describe("generateApplicationInsightsAction", () => {
  it("refuses a caller without organization access before queueing anything", async () => {
    state.authorized = false;
    const result = await generateApplicationInsightsAction("acme", APP_ID);
    expect(result).toMatchObject({ status: "error", message: /do not have access/ });
    expect(enqueueJobMatchInsight).not.toHaveBeenCalled();
  });

  it("rejects a malformed application id without touching the queue", async () => {
    const result = await generateApplicationInsightsAction("acme", "not-a-uuid");
    expect(result).toMatchObject({ status: "error", message: /no longer exists/ });
    expect(enqueueJobMatchInsight).not.toHaveBeenCalled();
  });

  it("reports success with the insight id when queued", async () => {
    enqueueJobMatchInsight.mockResolvedValue({ outcome: "enqueued", insightId: "ins-1" });
    const result = await generateApplicationInsightsAction("acme", APP_ID);
    expect(result).toEqual({
      status: "success",
      message: "Analysis started.",
      data: { insightId: "ins-1" },
    });
  });

  it("treats an already running analysis as success (idempotent retry)", async () => {
    enqueueJobMatchInsight.mockResolvedValue({ outcome: "already_active", insightId: "ins-0" });
    const result = await generateApplicationInsightsAction("acme", APP_ID);
    expect(result).toMatchObject({ status: "success", message: /already in progress/ });
  });

  it("explains that authorization is required instead of generating", async () => {
    enqueueJobMatchInsight.mockResolvedValue({ outcome: "authorization_required" });
    const result = await generateApplicationInsightsAction("acme", APP_ID);
    expect(result).toMatchObject({ status: "error", message: /not authorized AI analysis/ });
  });

  it("uses the same copy for hidden and missing applications", async () => {
    enqueueJobMatchInsight.mockResolvedValue({ outcome: "not_found" });
    const result = await generateApplicationInsightsAction("acme", APP_ID);
    expect(result).toMatchObject({
      status: "error",
      message: "This application no longer exists.",
    });
  });
});

describe("getApplicationInsightAction", () => {
  it("returns the latest insight for the tenant (null when none)", async () => {
    getLatestApplicationInsight.mockResolvedValue(null);
    expect(await getApplicationInsightAction("acme", APP_ID)).toEqual({
      status: "success",
      data: null,
    });
    expect(getLatestApplicationInsight).toHaveBeenCalledWith("org-1", APP_ID);
  });

  it("refuses a caller without organization access", async () => {
    state.authorized = false;
    const result = await getApplicationInsightAction("acme", APP_ID);
    expect(result.status).toBe("error");
    expect(getLatestApplicationInsight).not.toHaveBeenCalled();
  });
});
