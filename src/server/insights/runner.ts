import "server-only";
import { AiError } from "@/lib/ai/client";
import type { EvidenceSource } from "@/lib/ai/insights-contract";
import { analyzeJobMatch, extractCvText, InsightRunError } from "@/lib/ai/job-match";
import type { GithubPromptEvidence } from "@/lib/ai/job-match-prompt";
import { getServerEnv } from "@/lib/env";
import { fetchGithubEvidence } from "@/lib/github/evidence";
import { parseGithubProfileUrl, sameGithubLogin } from "@/lib/github/profile";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { CV_BUCKET } from "@/lib/validation/cv";

/**
 * The insights runner (ADR-036/038, docs/AI_INSIGHTS.md §4–6, §8). Processes queued
 * candidate_ai_insights rows: atomic claim → authorization re-check → CV download and text
 * extraction → optional GitHub evidence for the exact authorized profile → authorization re-check
 * → model call → authorization re-check → status-guarded persist. It runs without a user session
 * (behind POST /api/insights/run, secret-authenticated), so it uses the service-role client and
 * scopes every statement by organization_id.
 *
 * Nothing in this module logs or persists CV text, GitHub content, prompt content or the Azure
 * key. Failure messages come from AiError (pre-sanitised) or InsightRunError (ours); anything
 * else is replaced by a generic message.
 */

type AdminClient = ReturnType<typeof createAdminSupabase>;

export type RunOutcome = {
  insightId: string;
  outcome: "ready" | "failed" | "revoked" | "discarded" | "not_claimed";
  /** Safe to log/show: never contains document content. */
  message?: string;
};

/** A run claimed longer ago than this without finishing is treated as crashed (ADR-036). */
export const STALE_ANALYZING_MS = 10 * 60_000;
const STALE_MESSAGE = "The analysis did not finish in time. Retry to run it again.";
const REVOKED_MESSAGE = "AI authorization is not in place, so the analysis was stopped.";
const GITHUB_WITHDRAWN_MESSAGE =
  "GitHub authorization was withdrawn while the analysis ran, so the result was discarded. Retry for a CV-only analysis.";

const INSIGHT_COLUMNS =
  "id, organization_id, candidate_id, job_id, application_id, status, attempt_count, analysis_type";

type ClaimableRow = {
  id: string;
  organization_id: string;
  candidate_id: string;
  job_id: string | null;
  application_id: string | null;
  status: string;
  attempt_count: number;
  analysis_type: string;
};

/** Current authorization state of the candidate; null when CV analysis is not authorized. */
type Consent = {
  cvObjectKey: string;
  githubUrl: string | null;
  githubAuthorized: boolean;
};

export type GithubPlan =
  | { status: "planned"; login: string }
  | { status: "not_provided" | "invalid_url" | "not_authorized"; login: string | null };

/** Decides, from the authorization state, whether GitHub evidence may be used and for which login. */
export function planGithubEvidence(
  consent: Pick<Consent, "githubUrl" | "githubAuthorized">,
): GithubPlan {
  if (!consent.githubUrl) return { status: "not_provided", login: null };
  const profile = parseGithubProfileUrl(consent.githubUrl);
  if (!profile) return { status: "invalid_url", login: null };
  if (!consent.githubAuthorized) return { status: "not_authorized", login: profile.login };
  return { status: "planned", login: profile.login };
}

async function loadConsent(
  admin: AdminClient,
  organizationId: string,
  candidateId: string,
): Promise<Consent | null> {
  const { data, error } = await admin
    .from("candidates")
    .select("cv_object_key, cv_ai_authorized, github_url, github_ai_authorized")
    .eq("id", candidateId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(`candidate consent lookup failed: ${error.message}`);
  if (!data || !data.cv_ai_authorized || !data.cv_object_key) return null;
  return {
    cvObjectKey: data.cv_object_key,
    githubUrl: data.github_url,
    githubAuthorized: data.github_ai_authorized,
  };
}

/** True when GitHub evidence for `login` is (still) authorized by the current consent state. */
function githubStillAuthorized(consent: Consent, login: string): boolean {
  const plan = planGithubEvidence(consent);
  return plan.status === "planned" && sameGithubLogin(plan.login, login);
}

function githubToken(): string | undefined {
  try {
    return getServerEnv().GITHUB_TOKEN;
  } catch {
    return undefined;
  }
}

async function auditAsService(
  admin: AdminClient,
  action: "candidate.ai_insight_ready" | "candidate.ai_insight_failed",
  row: ClaimableRow,
  metadata: Record<string, Json> = {},
): Promise<void> {
  // log_audit_event() requires auth.uid(); the runner has no user, so it inserts directly with a
  // null actor (the column is nullable; service_role keeps insert on audit_events). Ids only.
  const { error } = await admin.from("audit_events").insert({
    actor_user_id: null,
    organization_id: row.organization_id,
    action,
    target_type: "candidate_ai_insight",
    target_id: row.id,
    metadata: {
      candidate_id: row.candidate_id,
      application_id: row.application_id,
      attempt: row.attempt_count,
      ...metadata,
    },
  });
  if (error) console.error(`[audit] failed to record ${action}: ${error.message}`);
}

/** Turns any thrown value into a message that is safe to persist and display. */
export function safeFailureMessage(error: unknown): { message: string; kind: string } {
  if (error instanceof AiError) return { message: error.message, kind: `ai_${error.kind}` };
  if (error instanceof InsightRunError) return { message: error.message, kind: "content" };
  return {
    message: "The analysis failed unexpectedly. Retry to run it again.",
    kind: "unexpected",
  };
}

async function markRevoked(admin: AdminClient, row: ClaimableRow): Promise<void> {
  await admin
    .from("candidate_ai_insights")
    .update({ status: "revoked", result: null, summary: null, error_message: REVOKED_MESSAGE })
    .eq("id", row.id)
    .eq("organization_id", row.organization_id)
    .eq("status", "analyzing");
}

async function markFailed(admin: AdminClient, row: ClaimableRow, message: string): Promise<void> {
  await admin
    .from("candidate_ai_insights")
    .update({ status: "failed", error_message: message })
    .eq("id", row.id)
    .eq("organization_id", row.organization_id)
    .eq("status", "analyzing");
}

/**
 * Processes one queued insight. Safe to call concurrently for the same id: only the caller whose
 * conditional claim wins proceeds; everyone else gets `not_claimed`.
 */
export async function processInsight(insightId: string): Promise<RunOutcome> {
  const admin = createAdminSupabase();

  const { data: pending, error: lookupError } = await admin
    .from("candidate_ai_insights")
    .select(INSIGHT_COLUMNS)
    .eq("id", insightId)
    .maybeSingle();
  if (lookupError) throw new Error(`insight lookup failed: ${lookupError.message}`);
  if (!pending || pending.status !== "pending" || pending.analysis_type !== "job_match") {
    return { insightId, outcome: "not_claimed" };
  }
  if (!pending.job_id || !pending.application_id) {
    await admin
      .from("candidate_ai_insights")
      .update({ status: "failed", error_message: "The job or application no longer exists." })
      .eq("id", pending.id)
      .eq("organization_id", pending.organization_id)
      .eq("status", "pending");
    return { insightId, outcome: "failed", message: "missing job or application" };
  }

  // The plan is decided before the claim so the claimed row already records the intended sources:
  // a GitHub revocation that lands while the run is in flight can then invalidate it.
  const initialConsent = await loadConsent(admin, pending.organization_id, pending.candidate_id);
  const plan: GithubPlan = initialConsent
    ? planGithubEvidence(initialConsent)
    : { status: "not_provided", login: null };
  const plannedSources: EvidenceSource[] = plan.status === "planned" ? ["cv", "github"] : ["cv"];

  // Atomic claim: the status filter makes exactly one claimer win.
  const row: ClaimableRow = { ...pending, attempt_count: pending.attempt_count + 1 };
  const { data: claimed, error: claimError } = await admin
    .from("candidate_ai_insights")
    .update({
      status: "analyzing",
      started_at: new Date().toISOString(),
      attempt_count: row.attempt_count,
      error_message: null,
      evidence_sources: plannedSources,
      github_login: plan.login,
      github_status: plan.status === "planned" ? null : plan.status,
    })
    .eq("id", row.id)
    .eq("organization_id", row.organization_id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (claimError) throw new Error(`insight claim failed: ${claimError.message}`);
  if (!claimed) return { insightId, outcome: "not_claimed" };

  try {
    // 1. Authorization at execution time (the enqueue-time check may be stale).
    const consent = await loadConsent(admin, row.organization_id, row.candidate_id);
    if (!consent) {
      await markRevoked(admin, row);
      return { insightId, outcome: "revoked" };
    }

    const { data: job, error: jobError } = await admin
      .from("jobs")
      .select("title, description")
      .eq("id", row.job_id!)
      .eq("organization_id", row.organization_id)
      .maybeSingle();
    if (jobError) throw new Error(`job lookup failed: ${jobError.message}`);
    if (!job) throw new InsightRunError("The job no longer exists.");

    // 2. The CV, read with the service role but only after the key is proven to be this tenant's.
    if (!consent.cvObjectKey.startsWith(`${row.organization_id}/`)) {
      throw new InsightRunError("The CV reference is not valid for this organization.");
    }
    const download = await admin.storage.from(CV_BUCKET).download(consent.cvObjectKey);
    if (download.error || !download.data) {
      throw new InsightRunError("The CV file could not be retrieved.");
    }
    const cvText = await extractCvText(new Uint8Array(await download.data.arrayBuffer()));

    // 3. GitHub evidence for the exact authorized login only; any failure degrades to CV-only.
    let github: GithubPromptEvidence | null = null;
    let githubStatus: string | null = plan.status === "planned" ? null : plan.status;
    let githubFetchedAt: string | null = null;
    if (plan.status === "planned" && githubStillAuthorized(consent, plan.login)) {
      const evidence = await fetchGithubEvidence(plan.login, { token: githubToken() });
      if (evidence.status === "included") {
        github = {
          login: evidence.login,
          profileUrl: evidence.profileUrl,
          repositories: evidence.repositories,
        };
        githubFetchedAt = evidence.fetchedAt;
        githubStatus = "included";
      } else {
        githubStatus = evidence.status;
      }
    } else if (plan.status === "planned") {
      githubStatus = "withdrawn";
    }

    // 4. Authorization again, immediately before any content leaves the server.
    const consentBeforeModel = await loadConsent(admin, row.organization_id, row.candidate_id);
    if (!consentBeforeModel) {
      await markRevoked(admin, row);
      return { insightId, outcome: "revoked" };
    }
    if (github && !githubStillAuthorized(consentBeforeModel, github.login)) {
      github = null;
      githubStatus = "withdrawn";
      githubFetchedAt = null;
    }
    const analysis = await analyzeJobMatch({
      jobTitle: job.title,
      jobDescription: job.description,
      cvText,
      github,
    });

    // 5. Authorization once more before anything derived from the material is persisted.
    const consentBeforePersist = await loadConsent(admin, row.organization_id, row.candidate_id);
    if (!consentBeforePersist) {
      await markRevoked(admin, row);
      return { insightId, outcome: "revoked" };
    }
    if (github && !githubStillAuthorized(consentBeforePersist, github.login)) {
      await markFailed(admin, row, GITHUB_WITHDRAWN_MESSAGE);
      return { insightId, outcome: "failed", message: "github authorization withdrawn" };
    }

    // 6. Status-guarded persist: if revocation (or anything) changed the row meanwhile, this
    //    affects zero rows and the result is discarded rather than overwriting a newer state.
    const { data: saved, error: saveError } = await admin
      .from("candidate_ai_insights")
      .update({
        status: "ready",
        result: analysis.result as unknown as Json,
        summary: analysis.result.summary,
        model_version: analysis.model,
        prompt_version: analysis.promptVersion,
        contract_version: analysis.contractVersion,
        input_hash: analysis.inputHash,
        evidence_sources: analysis.evidenceSources,
        github_login: plan.login,
        github_status: githubStatus,
        github_fetched_at: githubFetchedAt,
        source_urls: analysis.repositoryUrls,
        generated_at: new Date().toISOString(),
        error_message: null,
        human_review_required: true,
      })
      .eq("id", row.id)
      .eq("organization_id", row.organization_id)
      .eq("status", "analyzing")
      .select("id")
      .maybeSingle();
    if (saveError) throw new Error(`insight persist failed: ${saveError.message}`);
    if (!saved) {
      return { insightId, outcome: "discarded", message: "status changed during analysis" };
    }

    // Keep exactly one ready result per application: older successes become superseded.
    await admin
      .from("candidate_ai_insights")
      .update({ status: "superseded" })
      .eq("application_id", row.application_id!)
      .eq("organization_id", row.organization_id)
      .eq("status", "ready")
      .neq("id", row.id);

    await auditAsService(admin, "candidate.ai_insight_ready", row, {
      model: analysis.model,
      evidence_sources: analysis.evidenceSources,
      github_status: githubStatus,
    });
    return { insightId, outcome: "ready" };
  } catch (error) {
    const failure = safeFailureMessage(error);
    await markFailed(admin, row, failure.message);
    await auditAsService(admin, "candidate.ai_insight_failed", row, { kind: failure.kind });
    console.error(`[insights] run ${row.id} failed (${failure.kind}): ${failure.message}`);
    return { insightId, outcome: "failed", message: failure.message };
  }
}

/**
 * Marks runs that were claimed too long ago as failed, so a crashed worker cannot block an
 * application forever (the one-active-run index would otherwise refuse new runs). Returns ids.
 */
export async function recoverStuckRuns(
  admin: AdminClient = createAdminSupabase(),
): Promise<string[]> {
  const cutoff = new Date(Date.now() - STALE_ANALYZING_MS).toISOString();
  const { data, error } = await admin
    .from("candidate_ai_insights")
    .update({ status: "failed", error_message: STALE_MESSAGE })
    .eq("status", "analyzing")
    .lt("started_at", cutoff)
    .select("id");
  if (error) throw new Error(`stuck-run recovery failed: ${error.message}`);
  return (data ?? []).map((row) => row.id);
}

/**
 * Drain mode for the scheduler: recovers stuck runs, then processes up to `limit` pending rows,
 * oldest first and sequentially (keeps Azure usage smooth and makes each outcome attributable).
 */
export async function runPendingInsights(options: { limit?: number } = {}): Promise<RunOutcome[]> {
  const admin = createAdminSupabase();
  await recoverStuckRuns(admin);
  const limit = Math.min(Math.max(options.limit ?? 5, 1), 25);
  const { data, error } = await admin
    .from("candidate_ai_insights")
    .select("id")
    .eq("status", "pending")
    .eq("analysis_type", "job_match")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`pending insights lookup failed: ${error.message}`);
  const outcomes: RunOutcome[] = [];
  for (const row of data ?? []) {
    outcomes.push(await processInsight(row.id));
  }
  return outcomes;
}
