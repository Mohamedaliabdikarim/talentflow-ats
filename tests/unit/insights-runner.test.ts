import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeQuery, findFilter } from "./helpers/fake-supabase";

/**
 * The insights runner (ADR-036): atomic claim, authorization re-checks before extraction, before
 * the model call and before persisting, status-guarded persist (no stale overwrite), sanitised
 * failures, stuck-run recovery and tenant scoping of every statement. Azure and the PDF
 * extractor are mocked; the fake client records every query.
 */

vi.mock("server-only", () => ({}));

const CV_MARKER = "CV-PRIVATE-MARKER-7f3a";

class InsightRunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsightRunError";
  }
}
const extractCvText = vi.fn(async () => `Senior engineer. ${CV_MARKER}`);
const analyzeJobMatch = vi.fn();
vi.mock("@/lib/ai/job-match", () => ({ InsightRunError, extractCvText, analyzeJobMatch }));

type Row = {
  id: string;
  organization_id: string;
  candidate_id: string;
  job_id: string | null;
  application_id: string | null;
  status: string;
  attempt_count: number;
  analysis_type: string;
  started_at?: string;
  [key: string]: unknown;
};

type Consent = { cv_object_key: string | null; cv_ai_authorized: boolean };

const state: {
  row: Row;
  candidate: Consent;
  /** Per-read overrides of the candidate consent, consumed in order (simulates revocation). */
  consentSequence: Array<Consent | null>;
  job: { title: string; description: string | null } | null;
  stuck: string[];
  pending: string[];
} = {
  row: {} as Row,
  candidate: { cv_object_key: "org-1/cand-1/x.pdf", cv_ai_authorized: true },
  consentSequence: [],
  job: { title: "Fullstack Developer", description: "TypeScript and Azure." },
  stuck: [],
  pending: [],
};
const updates: Array<{ values: Record<string, unknown>; query: FakeQuery }> = [];
const audits: Array<Record<string, unknown>> = [];
const downloads: string[] = [];

function resolve(query: FakeQuery) {
  const { row } = state;
  if (query.table === "candidate_ai_insights") {
    if (query.op === "select") {
      if (findFilter(query, "status")?.value === "pending" && !findFilter(query, "id")) {
        return { data: state.pending.map((id) => ({ id })), error: null };
      }
      return { data: findFilter(query, "id")?.value === row.id ? { ...row } : null, error: null };
    }
    if (query.op === "update") {
      const values = query.values as Record<string, unknown>;
      updates.push({ values, query });
      if (!findFilter(query, "id")) {
        // List-shaped housekeeping: stuck recovery or superseding older results.
        if (findFilter(query, "started_at", "lt")) {
          return { data: state.stuck.map((id) => ({ id })), error: null };
        }
        return { data: [], error: null };
      }
      const statusFilter = findFilter(query, "status");
      if (statusFilter && row.status !== statusFilter.value) return { data: null, error: null };
      if (findFilter(query, "organization_id")?.value !== row.organization_id) {
        return { data: null, error: null };
      }
      Object.assign(row, values);
      return { data: { id: row.id }, error: null };
    }
  }
  if (query.table === "candidates") {
    const next =
      state.consentSequence.length > 0 ? state.consentSequence.shift()! : state.candidate;
    return { data: next, error: null };
  }
  if (query.table === "jobs") return { data: state.job, error: null };
  if (query.table === "audit_events") {
    audits.push(query.values as Record<string, unknown>);
    return { data: null, error: null };
  }
  return { data: null, error: null };
}

const fake = createFakeSupabase(resolve, {
  download: async (_bucket, key) => {
    downloads.push(key);
    return { data: { arrayBuffer: async () => new Uint8Array([0x25, 0x50]).buffer }, error: null };
  },
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => fake.client }));

const { AiError } = await import("@/lib/ai/client");
const { processInsight, recoverStuckRuns, runPendingInsights, safeFailureMessage } =
  await import("@/server/insights/runner");

const RESULT = {
  schema_version: "job-match-v1",
  summary: "Strong TypeScript evidence; Azure not evidenced.",
  assessments: [{ requirement: "TypeScript", status: "supported", evidence: "Recent roles." }],
  interview_questions: ["Which cloud platforms have you used?"],
  advisory_notice: "Advisory; a person reviews.",
};

let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  state.row = {
    id: "ins-1",
    organization_id: "org-1",
    candidate_id: "cand-1",
    job_id: "job-1",
    application_id: "app-1",
    status: "pending",
    attempt_count: 0,
    analysis_type: "job_match",
  };
  state.candidate = { cv_object_key: "org-1/cand-1/x.pdf", cv_ai_authorized: true };
  state.consentSequence = [];
  state.job = { title: "Fullstack Developer", description: "TypeScript and Azure." };
  state.stuck = [];
  state.pending = [];
  updates.length = 0;
  audits.length = 0;
  downloads.length = 0;
  fake.queries.length = 0;
  extractCvText.mockClear();
  analyzeJobMatch.mockReset();
  analyzeJobMatch.mockResolvedValue({
    result: RESULT,
    model: "gpt-5-mini-2025-08-07",
    inputHash: "a".repeat(64),
    promptVersion: "job-match-prompt-2026-10-20",
    contractVersion: "job-match-v1",
  });
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});

function allWrittenText(): string {
  return JSON.stringify({ updates, audits, logs: errors.mock.calls });
}

describe("processInsight — happy path", () => {
  it("claims, checks authorization three times, analyses, and persists a ready result", async () => {
    const outcome = await processInsight("ins-1");
    expect(outcome).toEqual({ insightId: "ins-1", outcome: "ready" });

    // Atomic claim: pending → analyzing with the attempt counter incremented.
    expect(updates[0]!.values).toMatchObject({ status: "analyzing", attempt_count: 1 });
    expect(findFilter(updates[0]!.query, "status")?.value).toBe("pending");

    const consentReads = fake.queries.filter((q) => q.table === "candidates");
    expect(consentReads).toHaveLength(3);
    expect(downloads).toEqual(["org-1/cand-1/x.pdf"]);
    expect(extractCvText).toHaveBeenCalledTimes(1);
    expect(analyzeJobMatch).toHaveBeenCalledWith({
      jobTitle: "Fullstack Developer",
      jobDescription: "TypeScript and Azure.",
      cvText: `Senior engineer. ${CV_MARKER}`,
    });

    const persist = updates.find((u) => u.values.status === "ready")!;
    expect(persist.values).toMatchObject({
      result: RESULT,
      summary: RESULT.summary,
      model_version: "gpt-5-mini-2025-08-07",
      prompt_version: "job-match-prompt-2026-10-20",
      contract_version: "job-match-v1",
      input_hash: "a".repeat(64),
      human_review_required: true,
      error_message: null,
    });
    expect(typeof persist.values.generated_at).toBe("string");
    // Guarded write: only an analyzing row of this tenant can be completed.
    expect(findFilter(persist.query, "status")?.value).toBe("analyzing");
    expect(findFilter(persist.query, "organization_id")?.value).toBe("org-1");

    const supersede = updates.find((u) => u.values.status === "superseded")!;
    expect(findFilter(supersede.query, "application_id")?.value).toBe("app-1");
    expect(findFilter(supersede.query, "id", "neq")?.value).toBe("ins-1");

    expect(audits).toEqual([
      expect.objectContaining({
        actor_user_id: null,
        organization_id: "org-1",
        action: "candidate.ai_insight_ready",
        target_id: "ins-1",
      }),
    ]);
  });

  it("scopes every insight statement by organization_id (service role, tenant-scoped)", async () => {
    await processInsight("ins-1");
    const scoped = fake.queries.filter(
      (q) => q.table === "candidate_ai_insights" && q.op === "update",
    );
    expect(scoped.length).toBeGreaterThan(0);
    for (const query of scoped) {
      expect(findFilter(query, "organization_id")?.value).toBe("org-1");
    }
  });

  it("never writes or logs CV text", async () => {
    await processInsight("ins-1");
    expect(allWrittenText()).not.toContain(CV_MARKER);
  });
});

describe("processInsight — claim and idempotency", () => {
  it("does not process a row that is not pending (already claimed or terminal)", async () => {
    state.row.status = "analyzing";
    expect(await processInsight("ins-1")).toEqual({ insightId: "ins-1", outcome: "not_claimed" });
    state.row.status = "ready";
    expect(await processInsight("ins-1")).toEqual({ insightId: "ins-1", outcome: "not_claimed" });
    expect(analyzeJobMatch).not.toHaveBeenCalled();
    expect(downloads).toHaveLength(0);
  });

  it("returns not_claimed for an unknown id", async () => {
    expect(await processInsight("missing")).toEqual({
      insightId: "missing",
      outcome: "not_claimed",
    });
  });
});

describe("processInsight — authorization and revocation", () => {
  it("stops before reading the CV when authorization is absent at execution time", async () => {
    state.candidate.cv_ai_authorized = false;
    const outcome = await processInsight("ins-1");
    expect(outcome).toEqual({ insightId: "ins-1", outcome: "revoked" });
    expect(downloads).toHaveLength(0);
    expect(analyzeJobMatch).not.toHaveBeenCalled();
    expect(state.row).toMatchObject({ status: "revoked", result: null, summary: null });
  });

  it("stops before the model call when authorization is withdrawn after extraction", async () => {
    state.consentSequence = [
      { cv_object_key: "org-1/cand-1/x.pdf", cv_ai_authorized: true },
      { cv_object_key: "org-1/cand-1/x.pdf", cv_ai_authorized: false },
    ];
    const outcome = await processInsight("ins-1");
    expect(outcome).toEqual({ insightId: "ins-1", outcome: "revoked" });
    expect(extractCvText).toHaveBeenCalledTimes(1);
    expect(analyzeJobMatch).not.toHaveBeenCalled();
    expect(state.row.status).toBe("revoked");
  });

  it("discards the result when authorization is withdrawn after the model call", async () => {
    state.consentSequence = [
      { cv_object_key: "org-1/cand-1/x.pdf", cv_ai_authorized: true },
      { cv_object_key: "org-1/cand-1/x.pdf", cv_ai_authorized: true },
      { cv_object_key: "org-1/cand-1/x.pdf", cv_ai_authorized: false },
    ];
    const outcome = await processInsight("ins-1");
    expect(outcome).toEqual({ insightId: "ins-1", outcome: "revoked" });
    expect(analyzeJobMatch).toHaveBeenCalledTimes(1);
    expect(updates.some((u) => u.values.status === "ready")).toBe(false);
    expect(state.row.result ?? null).toBeNull();
  });

  it("discards a stale result when the row changed during analysis (guarded write)", async () => {
    // A concurrent revocation flips the row while the model is running.
    analyzeJobMatch.mockImplementationOnce(async () => {
      state.row.status = "revoked";
      state.row.result = null;
      return {
        result: RESULT,
        model: "m",
        inputHash: "b".repeat(64),
        promptVersion: "p",
        contractVersion: "job-match-v1",
      };
    });
    const outcome = await processInsight("ins-1");
    expect(outcome).toEqual({
      insightId: "ins-1",
      outcome: "discarded",
      message: "status changed during analysis",
    });
    expect(state.row.status).toBe("revoked");
    expect(state.row.result).toBeNull();
    expect(audits).toHaveLength(0);
  });

  it("refuses a CV key that is not inside the tenant's folder", async () => {
    state.candidate.cv_object_key = "org-2/cand-9/y.pdf";
    const outcome = await processInsight("ins-1");
    expect(outcome).toMatchObject({ outcome: "failed" });
    expect(downloads).toHaveLength(0);
    expect(state.row.status).toBe("failed");
  });
});

describe("processInsight — failures", () => {
  it("marks the row failed with the sanitised AiError message when Azure fails", async () => {
    analyzeJobMatch.mockRejectedValueOnce(
      new AiError("rate_limit", "Azure OpenAI rate limit reached; retry shortly."),
    );
    const outcome = await processInsight("ins-1");
    expect(outcome).toMatchObject({ outcome: "failed" });
    expect(state.row).toMatchObject({
      status: "failed",
      error_message: "Azure OpenAI rate limit reached; retry shortly.",
    });
    expect(audits).toEqual([
      expect.objectContaining({
        action: "candidate.ai_insight_failed",
        metadata: expect.objectContaining({ kind: "ai_rate_limit" }),
      }),
    ]);
    expect(allWrittenText()).not.toContain(CV_MARKER);
  });

  it("marks the row failed with our own message for content problems", async () => {
    extractCvText.mockRejectedValueOnce(new InsightRunError("The CV could not be read as a PDF."));
    await processInsight("ins-1");
    expect(state.row).toMatchObject({
      status: "failed",
      error_message: "The CV could not be read as a PDF.",
    });
    expect(analyzeJobMatch).not.toHaveBeenCalled();
  });

  it("replaces unexpected errors with a generic message (no internals leak)", async () => {
    analyzeJobMatch.mockRejectedValueOnce(new Error(`stack dump containing ${CV_MARKER}`));
    await processInsight("ins-1");
    expect(state.row.error_message).toBe(
      "The analysis failed unexpectedly. Retry to run it again.",
    );
    expect(JSON.stringify(updates)).not.toContain(CV_MARKER);
    expect(JSON.stringify(audits)).not.toContain(CV_MARKER);
  });

  it("fails cleanly when the job was deleted meanwhile", async () => {
    state.job = null;
    await processInsight("ins-1");
    expect(state.row).toMatchObject({
      status: "failed",
      error_message: "The job no longer exists.",
    });
  });

  it("safeFailureMessage maps error kinds", () => {
    expect(safeFailureMessage(new AiError("timeout", "t")).kind).toBe("ai_timeout");
    expect(safeFailureMessage(new InsightRunError("c")).kind).toBe("content");
    expect(safeFailureMessage("weird").kind).toBe("unexpected");
  });
});

describe("drain mode", () => {
  it("recovers stuck runs older than the stale threshold", async () => {
    state.stuck = ["old-1", "old-2"];
    expect(await recoverStuckRuns(fake.client as never)).toEqual(["old-1", "old-2"]);
    const recovery = updates[0]!;
    expect(recovery.values).toMatchObject({ status: "failed" });
    expect(findFilter(recovery.query, "status")?.value).toBe("analyzing");
    expect(findFilter(recovery.query, "started_at", "lt")).toBeDefined();
  });

  it("runPendingInsights recovers first, then processes pending rows oldest-first", async () => {
    state.pending = ["ins-1"];
    const outcomes = await runPendingInsights({ limit: 5 });
    expect(outcomes).toEqual([{ insightId: "ins-1", outcome: "ready" }]);
    expect(updates[0]!.values).toMatchObject({ status: "failed" }); // stuck recovery ran first
    const listing = fake.queries.find(
      (q) => q.table === "candidate_ai_insights" && q.op === "select" && !findFilter(q, "id"),
    )!;
    expect(findFilter(listing, "status")?.value).toBe("pending");
    expect(findFilter(listing, "analysis_type")?.value).toBe("job_match");
  });
});
