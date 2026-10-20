import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeQuery } from "./helpers/fake-supabase";

/**
 * Enqueueing a Job Match analysis (ADR-035/036): authorization gate, the durable pending row,
 * idempotency on the one-active-run index, and the best-effort runner kick. No network.
 */

vi.mock("server-only", () => ({}));

const afterCallbacks: Array<() => Promise<void> | void> = [];
vi.mock("next/server", () => ({
  after: (callback: () => Promise<void> | void) => {
    afterCallbacks.push(callback);
  },
}));

const recordAuditEvent = vi.fn(async () => {});
vi.mock("@/server/audit", () => ({ recordAuditEvent }));

const { enqueueJobMatchInsight, kickInsightsRunner } = await import("@/server/insights/queue");

const ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  NEXT_PUBLIC_APP_URL: "https://talentflow.example.test",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  INSIGHTS_RUNNER_SECRET: "runner-secret-0123456789abcdef",
};
const saved: Record<string, string | undefined> = {};

const organization = {
  id: "org-1",
  name: "Acme",
  slug: "acme",
  status: "active" as const,
  userId: "user-1",
  role: "owner" as const,
  isPlatformAdmin: false,
  actingAsAdmin: false,
};

const state = {
  application: { id: "app-1", candidate_id: "cand-1", job_id: "job-1" } as {
    id: string;
    candidate_id: string;
    job_id: string;
  } | null,
  candidate: {
    id: "cand-1",
    cv_object_key: "org-1/cand-1/x.pdf" as string | null,
    cv_ai_authorized: true,
    cv_ai_authorized_at: "2026-10-20T10:00:00.000Z",
  },
  insertError: null as { code: string; message: string } | null,
};

function resolve(query: FakeQuery) {
  if (query.table === "applications") return { data: state.application, error: null };
  if (query.table === "candidates") return { data: state.candidate, error: null };
  if (query.table === "candidate_ai_insights" && query.op === "insert") {
    return state.insertError
      ? { data: null, error: state.insertError }
      : { data: { id: "insight-1" }, error: null };
  }
  if (query.table === "candidate_ai_insights")
    return { data: { id: "insight-active" }, error: null };
  return { data: null, error: null };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  for (const [key, value] of Object.entries(ENV)) {
    saved[key] = process.env[key];
    process.env[key] = value;
  }
  state.application = { id: "app-1", candidate_id: "cand-1", job_id: "job-1" };
  state.candidate = {
    id: "cand-1",
    cv_object_key: "org-1/cand-1/x.pdf",
    cv_ai_authorized: true,
    cv_ai_authorized_at: "2026-10-20T10:00:00.000Z",
  };
  state.insertError = null;
  afterCallbacks.length = 0;
  recordAuditEvent.mockClear();
  fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  for (const key of Object.keys(ENV)) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllGlobals();
});

describe("enqueueJobMatchInsight", () => {
  it("queues nothing and reports authorization_required when the candidate has not authorized", async () => {
    state.candidate.cv_ai_authorized = false;
    const { client, queries } = createFakeSupabase(resolve);
    const outcome = await enqueueJobMatchInsight({
      supabase: client as never,
      organization,
      applicationId: "app-1",
    });
    expect(outcome).toEqual({ outcome: "authorization_required" });
    expect(queries.some((q) => q.op === "insert")).toBe(false);
    expect(recordAuditEvent).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(0);
  });

  it("also requires a CV to be present, not just the flag", async () => {
    state.candidate.cv_object_key = null;
    const { client } = createFakeSupabase(resolve);
    const outcome = await enqueueJobMatchInsight({
      supabase: client as never,
      organization,
      applicationId: "app-1",
    });
    expect(outcome).toEqual({ outcome: "authorization_required" });
  });

  it("reports not_found for an application outside the caller's tenant", async () => {
    state.application = null;
    const { client, queries } = createFakeSupabase(resolve);
    const outcome = await enqueueJobMatchInsight({
      supabase: client as never,
      organization,
      applicationId: "app-9",
    });
    expect(outcome).toEqual({ outcome: "not_found" });
    const lookup = queries.find((q) => q.table === "applications")!;
    expect(lookup.filters).toContainEqual({
      method: "eq",
      column: "organization_id",
      value: "org-1",
    });
  });

  it("inserts a tenant-scoped pending row, audits ids only, and kicks the runner", async () => {
    const { client, queries } = createFakeSupabase(resolve);
    const outcome = await enqueueJobMatchInsight({
      supabase: client as never,
      organization,
      applicationId: "app-1",
    });
    expect(outcome).toEqual({ outcome: "enqueued", insightId: "insight-1" });

    const insert = queries.find((q) => q.op === "insert")!;
    expect(insert.values).toMatchObject({
      organization_id: "org-1",
      candidate_id: "cand-1",
      job_id: "job-1",
      application_id: "app-1",
      analysis_type: "job_match",
      status: "pending",
      cv_consent_at: "2026-10-20T10:00:00.000Z",
      human_review_required: true,
      created_by: "user-1",
    });

    expect(recordAuditEvent).toHaveBeenCalledWith("candidate.ai_insight_requested", {
      organizationId: "org-1",
      targetType: "candidate_ai_insight",
      targetId: "insight-1",
      metadata: { candidate_id: "cand-1", application_id: "app-1" },
    });

    expect(afterCallbacks).toHaveLength(1);
    await afterCallbacks[0]!();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://talentflow.example.test/api/insights/run");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-insights-secret"]).toBe(
      ENV.INSIGHTS_RUNNER_SECRET,
    );
    expect(JSON.parse(String(init.body))).toEqual({ insightId: "insight-1" });
  });

  it("is idempotent: a second enqueue while a run is active reports already_active", async () => {
    state.insertError = { code: "23505", message: "duplicate key" };
    const { client } = createFakeSupabase(resolve);
    const outcome = await enqueueJobMatchInsight({
      supabase: client as never,
      organization,
      applicationId: "app-1",
    });
    expect(outcome).toEqual({ outcome: "already_active", insightId: "insight-active" });
    expect(recordAuditEvent).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(0);
  });

  it("surfaces other insert failures as errors (the caller decides what to do)", async () => {
    state.insertError = { code: "XX000", message: "boom" };
    const { client } = createFakeSupabase(resolve);
    await expect(
      enqueueJobMatchInsight({ supabase: client as never, organization, applicationId: "app-1" }),
    ).rejects.toThrow(/insight enqueue failed/);
  });
});

describe("kickInsightsRunner", () => {
  it("does nothing without a configured runner secret (the row waits for a scheduled run)", () => {
    delete process.env.INSIGHTS_RUNNER_SECRET;
    expect(kickInsightsRunner("insight-1")).toBe(false);
    expect(afterCallbacks).toHaveLength(0);
  });

  it("swallows a failed kick: it is best-effort, never a durability mechanism", async () => {
    fetchMock.mockRejectedValueOnce(new Error("connection refused"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(kickInsightsRunner("insight-1")).toBe(true);
    await expect(afterCallbacks[0]!()).resolves.toBeUndefined();
    expect(errors).toHaveBeenCalledWith(expect.stringMatching(/runner kick for insight-1 failed/));
    errors.mockRestore();
  });
});
