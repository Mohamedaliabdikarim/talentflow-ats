import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Workspace mutations: the organization is always taken from the URL context (never from
 * the form), non-members are rejected before any query, and database errors are mapped
 * to safe messages.
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

const h = vi.hoisted(() => ({
  authorized: true,
  context: {
    id: "org-1",
    name: "Org",
    slug: "org",
    status: "active",
    userId: "user-1",
    role: "member",
    isPlatformAdmin: false,
    actingAsAdmin: false,
  },
  // Each call to from(table) records { table, op, payload, filters } and returns `result`.
  calls: [] as Array<{ table: string; op: string; payload?: unknown; filters: unknown[] }>,
  result: { data: null as unknown, error: null as unknown },
}));

vi.mock("@/server/auth", () => {
  class AuthorizationError extends Error {
    readonly status = 403;
    constructor(message = "You do not have access to this organization") {
      super(message);
      this.name = "AuthorizationError";
    }
  }
  return {
    AuthorizationError,
    requireOrgAccess: async () => {
      if (!h.authorized) throw new AuthorizationError();
      return h.context;
    },
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    from: (table: string) => {
      const call = { table, op: "", payload: undefined as unknown, filters: [] as unknown[] };
      h.calls.push(call);
      const builder = {
        insert: (payload: unknown) => ((call.op = "insert"), (call.payload = payload), builder),
        update: (payload: unknown) => ((call.op = "update"), (call.payload = payload), builder),
        delete: () => ((call.op = "delete"), builder),
        select: () => builder,
        eq: (column: string, value: unknown) => (call.filters.push([column, value]), builder),
        single: async () => h.result,
        maybeSingle: async () => h.result,
        then: (resolve: (value: unknown) => void) => resolve(h.result),
      };
      return builder;
    },
  }),
}));

const { createJobAction, updateJobAction } = await import("@/server/actions/jobs");
const { createCandidateAction } = await import("@/server/actions/candidates");
const { addToPipelineAction, moveApplicationStageAction } =
  await import("@/server/actions/applications");

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

beforeEach(() => {
  h.authorized = true;
  h.calls.length = 0;
  h.result = { data: null, error: null };
});

describe("tenant pinning", () => {
  it("createJobAction writes organization_id from the URL context, ignoring form values", async () => {
    h.result = { data: { id: "job-1" }, error: null };
    await expect(
      createJobAction(
        "org",
        { status: "idle" },
        form({ title: "Backend Engineer", organization_id: "attacker-org", organizationId: "x" }),
      ),
    ).rejects.toThrow("REDIRECT:/o/org/jobs/job-1");
    expect(h.calls[0]).toMatchObject({ table: "jobs", op: "insert" });
    expect(h.calls[0].payload).toMatchObject({
      organization_id: "org-1",
      created_by: "user-1",
      title: "Backend Engineer",
      status: "open",
    });
  });

  it("updateJobAction and moveApplicationStageAction filter by the context organization", async () => {
    h.result = { data: { id: "job-1" }, error: null };
    await expect(
      updateJobAction("org", "job-1", { status: "idle" }, form({ title: "Renamed" })),
    ).rejects.toThrow("REDIRECT:/o/org/jobs/job-1");
    expect(h.calls[0].filters).toEqual(
      expect.arrayContaining([
        ["id", "job-1"],
        ["organization_id", "org-1"],
      ]),
    );

    h.calls.length = 0;
    h.result = { data: { id: "app-1" }, error: null };
    const moved = await moveApplicationStageAction("org", {
      applicationId: "55555555-5555-4555-8555-555555555555",
      stage: "interview",
    });
    expect(moved).toMatchObject({ status: "success", message: "Moved to Interview" });
    // The stage lookup (ADR-035 trigger detection) and the update are both tenant-scoped.
    expect(h.calls[0]).toMatchObject({ table: "applications", op: "" });
    expect(h.calls[0].filters).toEqual(expect.arrayContaining([["organization_id", "org-1"]]));
    const update = h.calls.find((call) => call.table === "applications" && call.op === "update");
    expect(update).toBeDefined();
    expect(update!.filters).toEqual(expect.arrayContaining([["organization_id", "org-1"]]));
  });
});

describe("authorization and validation", () => {
  it("rejects non-members before touching the database", async () => {
    h.authorized = false;
    const job = await createJobAction("org", { status: "idle" }, form({ title: "Backend" }));
    const move = await moveApplicationStageAction("org", {
      applicationId: "55555555-5555-4555-8555-555555555555",
      stage: "offer",
    });
    expect(job).toEqual({
      status: "error",
      message: "You do not have access to this organization",
    });
    expect(move.status).toBe("error");
    expect(h.calls).toHaveLength(0);
  });

  it("returns field errors for an invalid job and candidate", async () => {
    const job = await createJobAction("org", { status: "idle" }, form({ title: "x" }));
    expect(job).toMatchObject({ status: "error", fieldErrors: { title: expect.any(Array) } });
    const candidate = await createCandidateAction(
      "org",
      { status: "idle" },
      form({ fullName: "Ada Example", linkedinUrl: "http://linkedin.com/in/ada" }),
    );
    expect(candidate).toMatchObject({
      status: "error",
      fieldErrors: { linkedinUrl: expect.any(Array) },
    });
    expect(h.calls).toHaveLength(0);
  });

  it("rejects an unknown stage and reports a missing application", async () => {
    const unknown = await moveApplicationStageAction("org", {
      applicationId: "55555555-5555-4555-8555-555555555555",
      stage: "archived",
    });
    expect(unknown).toMatchObject({ status: "error", message: "Unknown stage" });
    expect(h.calls).toHaveLength(0);

    h.result = { data: null, error: null };
    const missing = await moveApplicationStageAction("org", {
      applicationId: "55555555-5555-4555-8555-555555555555",
      stage: "offer",
    });
    expect(missing).toMatchObject({
      status: "error",
      message: "This application no longer exists",
    });
  });
});

describe("addToPipelineAction", () => {
  const jobId = "66666666-6666-4666-8666-666666666666";
  const candidateId = "77777777-7777-4777-8777-777777777777";

  it("maps a duplicate application and a cross-tenant reference to safe messages", async () => {
    h.result = { data: null, error: { code: "23505", message: "duplicate" } };
    const duplicate = await addToPipelineAction(
      "org",
      { status: "idle" },
      form({ jobId, candidateId }),
    );
    expect(duplicate).toMatchObject({
      status: "error",
      message: "This candidate is already in that job's pipeline",
    });

    h.result = { data: null, error: { code: "23503", message: "fk" } };
    const foreign = await addToPipelineAction(
      "org",
      { status: "idle" },
      form({ jobId, candidateId }),
    );
    expect(foreign).toMatchObject({
      status: "error",
      message: "Job or candidate not found in this workspace",
    });
  });

  it("creates the application with the context organization and user", async () => {
    const result = await addToPipelineAction(
      "org",
      { status: "idle" },
      form({ jobId, candidateId }),
    );
    expect(result).toMatchObject({ status: "success" });
    expect(h.calls[0].payload).toEqual({
      organization_id: "org-1",
      job_id: jobId,
      candidate_id: candidateId,
      created_by: "user-1",
    });
  });
});

describe("createCandidateAction with a job", () => {
  it("validates the job belongs to the workspace before creating anything", async () => {
    h.result = { data: null, error: null };
    const result = await createCandidateAction(
      "org",
      { status: "idle" },
      form({ fullName: "Ada Example", jobId: "66666666-6666-4666-8666-666666666666" }),
    );
    expect(result).toMatchObject({ status: "error", fieldErrors: { jobId: ["Unknown job"] } });
    expect(h.calls.map((call) => call.op)).toEqual([""]);
  });
});
