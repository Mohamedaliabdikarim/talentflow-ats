import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeQuery, findFilter } from "./helpers/fake-supabase";

/**
 * The insights runner (ADR-036/038): atomic claim with planned sources, authorization re-checks
 * before extraction, before the model call and before persisting, GitHub evidence for the exact
 * authorized login only with graceful degradation, status-guarded persist (no stale overwrite),
 * sanitised failures, stuck-run recovery and tenant scoping of every statement. Azure, the PDF
 * extractor and the GitHub fetcher are mocked; the fake client records every query.
 */

vi.mock("server-only", () => ({}));

const CV_MARKER = "CV-PRIVATE-MARKER-7f3a";
const GH_MARKER = "GH-README-MARKER-91c2";
const REPO = "https://github.com/octocat/hello-world";

class InsightRunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsightRunError";
  }
}
const extractCvText = vi.fn(async () => `Senior engineer. ${CV_MARKER}`);
const analyzeJobMatch = vi.fn();
vi.mock("@/lib/ai/job-match", () => ({ InsightRunError, extractCvText, analyzeJobMatch }));

const fetchGithubEvidence = vi.fn();
vi.mock("@/lib/github/evidence", () => ({ fetchGithubEvidence }));

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

type Consent = {
  cv_object_key: string | null;
  cv_ai_authorized: boolean;
  github_url: string | null;
  github_ai_authorized: boolean;
};

const CV_ONLY: Consent = {
  cv_object_key: "org-1/cand-1/x.pdf",
  cv_ai_authorized: true,
  github_url: null,
  github_ai_authorized: false,
};
const WITH_GITHUB: Consent = {
  ...CV_ONLY,
  github_url: "https://github.com/octocat",
  github_ai_authorized: true,
};
const GITHUB_NOT_AUTHORIZED: Consent = { ...WITH_GITHUB, github_ai_authorized: false };
const CV_REVOKED: Consent = { ...CV_ONLY, cv_ai_authorized: false };

const state: {
  row: Row;
  candidate: Consent;
  /** Per-read overrides of the consent, consumed in order (simulates revocation mid-run). */
  consentSequence: Array<Consent | null>;
  job: { title: string; description: string | null } | null;
  stuck: string[];
  pending: string[];
} = {
  row: {} as Row,
  candidate: CV_ONLY,
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
const {
  planGithubEvidence,
  processInsight,
  recoverStuckRuns,
  runPendingInsights,
  safeFailureMessage,
} = await import("@/server/insights/runner");

const RESULT = {
  schema_version: "job-match-v2",
  summary: "Strong TypeScript evidence; Azure not evidenced.",
  github_overview: "",
  assessments: [
    {
      requirement: "TypeScript",
      status: "supported",
      evidence: [{ source: "cv", text: "Recent roles.", repository_url: null }],
    },
  ],
  interview_questions: ["Which cloud platforms have you used?"],
  advisory_notice: "Advisory; a person reviews.",
};

const INCLUDED_EVIDENCE = {
  status: "included",
  login: "octocat",
  profileUrl: "https://github.com/octocat",
  repositories: [
    {
      name: "hello-world",
      url: REPO,
      description: "Says hello",
      languages: ["TypeScript"],
      topics: [],
      pushedAt: "2026-09-01T10:00:00Z",
      readmeExcerpt: `Readme ${GH_MARKER}`,
    },
  ],
  fetchedAt: "2026-10-21T12:00:00.000Z",
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
  state.candidate = CV_ONLY;
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
  analyzeJobMatch.mockImplementation(
    async ({ github }: { github: { repositories: Array<{ url: string }> } | null }) => ({
      result: { ...RESULT, github_overview: github ? "Shows TypeScript exposure." : "" },
      model: "gpt-5-mini-2025-08-07",
      inputHash: "a".repeat(64),
      promptVersion: "job-match-prompt-v2-2026-10-21",
      contractVersion: "job-match-v2",
      evidenceSources: github ? ["cv", "github"] : ["cv"],
      repositoryUrls: github ? github.repositories.map((r) => r.url) : [],
    }),
  );
  fetchGithubEvidence.mockReset();
  fetchGithubEvidence.mockResolvedValue(INCLUDED_EVIDENCE);
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});

function allWrittenText(): string {
  return JSON.stringify({ updates, audits, logs: errors.mock.calls });
}

function claimUpdate() {
  return updates.find((u) => u.values.status === "analyzing")!;
}
function readyUpdate() {
  return updates.find((u) => u.values.status === "ready");
}

describe("planGithubEvidence", () => {
  it("maps the authorization state to a plan without guessing", () => {
    expect(planGithubEvidence({ githubUrl: null, githubAuthorized: true })).toEqual({
      status: "not_provided",
      login: null,
    });
    expect(
      planGithubEvidence({ githubUrl: "https://github.com/octocat/repo", githubAuthorized: true }),
    ).toEqual({ status: "invalid_url", login: null });
    expect(
      planGithubEvidence({ githubUrl: "https://github.com/octocat", githubAuthorized: false }),
    ).toEqual({
      status: "not_authorized",
      login: "octocat",
    });
    expect(
      planGithubEvidence({ githubUrl: "https://github.com/octocat", githubAuthorized: true }),
    ).toEqual({
      status: "planned",
      login: "octocat",
    });
  });
});

describe("processInsight — CV-only (no GitHub profile)", () => {
  it("claims, checks authorization four times, analyses the CV only, and persists a ready result", async () => {
    const outcome = await processInsight("ins-1");
    expect(outcome).toEqual({ insightId: "ins-1", outcome: "ready" });

    expect(claimUpdate().values).toMatchObject({
      status: "analyzing",
      attempt_count: 1,
      evidence_sources: ["cv"],
      github_login: null,
      github_status: "not_provided",
    });
    expect(findFilter(claimUpdate().query, "status")?.value).toBe("pending");

    expect(fake.queries.filter((q) => q.table === "candidates")).toHaveLength(4);
    expect(downloads).toEqual(["org-1/cand-1/x.pdf"]);
    expect(fetchGithubEvidence).not.toHaveBeenCalled();
    expect(analyzeJobMatch).toHaveBeenCalledWith({
      jobTitle: "Fullstack Developer",
      jobDescription: "TypeScript and Azure.",
      cvText: `Senior engineer. ${CV_MARKER}`,
      github: null,
    });

    const persist = readyUpdate()!;
    expect(persist.values).toMatchObject({
      summary: RESULT.summary,
      model_version: "gpt-5-mini-2025-08-07",
      contract_version: "job-match-v2",
      evidence_sources: ["cv"],
      github_status: "not_provided",
      github_login: null,
      github_fetched_at: null,
      source_urls: [],
      human_review_required: true,
      error_message: null,
    });
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
        metadata: expect.objectContaining({ evidence_sources: ["cv"] }),
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

describe("processInsight — GitHub evidence", () => {
  it("fetches the exact authorized login, passes the evidence to the model and records provenance", async () => {
    state.candidate = WITH_GITHUB;
    const outcome = await processInsight("ins-1");
    expect(outcome).toEqual({ insightId: "ins-1", outcome: "ready" });

    expect(claimUpdate().values).toMatchObject({
      evidence_sources: ["cv", "github"],
      github_login: "octocat",
      github_status: null,
    });
    expect(fetchGithubEvidence).toHaveBeenCalledTimes(1);
    expect(fetchGithubEvidence.mock.calls[0]![0]).toBe("octocat");
    expect(analyzeJobMatch).toHaveBeenCalledWith(
      expect.objectContaining({
        github: {
          login: "octocat",
          profileUrl: "https://github.com/octocat",
          repositories: INCLUDED_EVIDENCE.repositories,
        },
      }),
    );
    expect(readyUpdate()!.values).toMatchObject({
      evidence_sources: ["cv", "github"],
      github_login: "octocat",
      github_status: "included",
      github_fetched_at: "2026-10-21T12:00:00.000Z",
      source_urls: [REPO],
    });
    expect(audits[0]!.metadata).toMatchObject({
      evidence_sources: ["cv", "github"],
      github_status: "included",
    });
  });

  it("never writes or logs GitHub README content", async () => {
    state.candidate = WITH_GITHUB;
    await processInsight("ins-1");
    expect(allWrittenText()).not.toContain(GH_MARKER);
  });

  it("does not fetch when the profile is present but not authorized", async () => {
    state.candidate = GITHUB_NOT_AUTHORIZED;
    await processInsight("ins-1");
    expect(fetchGithubEvidence).not.toHaveBeenCalled();
    expect(analyzeJobMatch).toHaveBeenCalledWith(expect.objectContaining({ github: null }));
    expect(readyUpdate()!.values).toMatchObject({
      evidence_sources: ["cv"],
      github_login: "octocat",
      github_status: "not_authorized",
      source_urls: [],
    });
  });

  it("does not fetch for an invalid profile URL even when authorized", async () => {
    state.candidate = { ...WITH_GITHUB, github_url: "https://github.com/octocat/some-repo" };
    await processInsight("ins-1");
    expect(fetchGithubEvidence).not.toHaveBeenCalled();
    expect(readyUpdate()!.values).toMatchObject({
      github_status: "invalid_url",
      github_login: null,
    });
  });

  it.each(["not_found", "rate_limited", "unavailable"] as const)(
    "degrades to a CV-only result when GitHub reports %s",
    async (status) => {
      state.candidate = WITH_GITHUB;
      fetchGithubEvidence.mockResolvedValueOnce({ status, login: "octocat", message: "x" });
      const outcome = await processInsight("ins-1");
      expect(outcome).toEqual({ insightId: "ins-1", outcome: "ready" });
      expect(analyzeJobMatch).toHaveBeenCalledWith(expect.objectContaining({ github: null }));
      expect(readyUpdate()!.values).toMatchObject({
        evidence_sources: ["cv"],
        github_status: status,
        github_login: "octocat",
        github_fetched_at: null,
        source_urls: [],
      });
    },
  );

  it("drops GitHub evidence when its authorization is withdrawn before the model call", async () => {
    state.candidate = WITH_GITHUB;
    state.consentSequence = [
      WITH_GITHUB,
      WITH_GITHUB,
      GITHUB_NOT_AUTHORIZED,
      GITHUB_NOT_AUTHORIZED,
    ];
    const outcome = await processInsight("ins-1");
    expect(outcome).toEqual({ insightId: "ins-1", outcome: "ready" });
    expect(fetchGithubEvidence).toHaveBeenCalledTimes(1);
    expect(analyzeJobMatch).toHaveBeenCalledWith(expect.objectContaining({ github: null }));
    expect(readyUpdate()!.values).toMatchObject({
      evidence_sources: ["cv"],
      github_status: "withdrawn",
      github_fetched_at: null,
    });
  });

  it("discards the result and marks the run failed when GitHub authorization is withdrawn after the model call", async () => {
    state.candidate = WITH_GITHUB;
    state.consentSequence = [WITH_GITHUB, WITH_GITHUB, WITH_GITHUB, GITHUB_NOT_AUTHORIZED];
    const outcome = await processInsight("ins-1");
    expect(outcome).toMatchObject({ insightId: "ins-1", outcome: "failed" });
    expect(analyzeJobMatch).toHaveBeenCalledWith(
      expect.objectContaining({ github: expect.anything() }),
    );
    expect(readyUpdate()).toBeUndefined();
    expect(state.row).toMatchObject({ status: "failed" });
    expect(String(state.row.error_message)).toMatch(/GitHub authorization was withdrawn/);
    expect(allWrittenText()).not.toContain(GH_MARKER);
  });

  it("treats a changed profile URL mid-run as withdrawn (exact profile only)", async () => {
    state.candidate = WITH_GITHUB;
    const other = { ...WITH_GITHUB, github_url: "https://github.com/someone-else" };
    state.consentSequence = [WITH_GITHUB, WITH_GITHUB, other, other];
    await processInsight("ins-1");
    expect(analyzeJobMatch).toHaveBeenCalledWith(expect.objectContaining({ github: null }));
    expect(readyUpdate()!.values).toMatchObject({ github_status: "withdrawn" });
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

describe("processInsight — CV authorization and revocation", () => {
  it("stops before reading the CV when authorization is absent at execution time", async () => {
    state.candidate = CV_REVOKED;
    const outcome = await processInsight("ins-1");
    expect(outcome).toEqual({ insightId: "ins-1", outcome: "revoked" });
    expect(downloads).toHaveLength(0);
    expect(analyzeJobMatch).not.toHaveBeenCalled();
    expect(state.row).toMatchObject({ status: "revoked", result: null, summary: null });
  });

  it("stops before the model call when authorization is withdrawn after extraction", async () => {
    state.consentSequence = [CV_ONLY, CV_ONLY, CV_REVOKED];
    const outcome = await processInsight("ins-1");
    expect(outcome).toEqual({ insightId: "ins-1", outcome: "revoked" });
    expect(extractCvText).toHaveBeenCalledTimes(1);
    expect(analyzeJobMatch).not.toHaveBeenCalled();
    expect(state.row.status).toBe("revoked");
  });

  it("discards the result when authorization is withdrawn after the model call", async () => {
    state.consentSequence = [CV_ONLY, CV_ONLY, CV_ONLY, CV_REVOKED];
    const outcome = await processInsight("ins-1");
    expect(outcome).toEqual({ insightId: "ins-1", outcome: "revoked" });
    expect(analyzeJobMatch).toHaveBeenCalledTimes(1);
    expect(readyUpdate()).toBeUndefined();
    expect(state.row.result ?? null).toBeNull();
  });

  it("discards a stale result when the row changed during analysis (guarded write)", async () => {
    analyzeJobMatch.mockImplementationOnce(async () => {
      state.row.status = "revoked";
      state.row.result = null;
      return {
        result: RESULT,
        model: "m",
        inputHash: "b".repeat(64),
        promptVersion: "p",
        contractVersion: "job-match-v2",
        evidenceSources: ["cv"],
        repositoryUrls: [],
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
    state.candidate = { ...CV_ONLY, cv_object_key: "org-2/cand-9/y.pdf" };
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
