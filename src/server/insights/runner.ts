import "server-only";
import { AiError } from "@/lib/ai/client";
import { analyzeJobMatch, extractCvText, InsightRunError } from "@/lib/ai/job-match";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { CV_BUCKET } from "@/lib/validation/cv";

/**
 * The insights runner (ADR-036, docs/AI_INSIGHTS.md §4–6). Processes queued
 * candidate_ai_insights rows: atomic claim → authorization re-check → CV download and text
 * extraction → authorization re-check → model call → authorization re-check → status-guarded
 * persist. It runs without a user session (behind POST /api/insights/run, secret-authenticated),
 * so it uses the service-role client and scopes every statement by organization_id.
 *
 * Nothing in this module logs or persists CV text, prompt content or the Azure key. Failure
 * messages come from AiError (pre-sanitised) or InsightRunError (ours); anything else is
 * replaced by a generic message.
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

async function loadConsent(
  admin: AdminClient,
  organizationId: string,
  candidateId: string,
): Promise<{ cvObjectKey: string } | null> {
  const { data, error } = await admin
    .from("candidates")
    .select("cv_object_key, cv_ai_authorized")
    .eq("id", candidateId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(`candidate consent lookup failed: ${error.message}`);
  if (!data || !data.cv_ai_authorized || !data.cv_object_key) return null;
  return { cvObjectKey: data.cv_object_key };
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

  // Atomic claim: the status filter makes exactly one claimer win.
  const row: ClaimableRow = { ...pending, attempt_count: pending.attempt_count + 1 };
  const { data: claimed, error: claimError } = await admin
    .from("candidate_ai_insights")
    .update({
      status: "analyzing",
      started_at: new Date().toISOString(),
      attempt_count: row.attempt_count,
      error_message: null,
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

    // 3. Authorization again, immediately before any content leaves the server.
    if (!(await loadConsent(admin, row.organization_id, row.candidate_id))) {
      await markRevoked(admin, row);
      return { insightId, outcome: "revoked" };
    }
    const analysis = await analyzeJobMatch({
      jobTitle: job.title,
      jobDescription: job.description,
      cvText,
    });

    // 4. Authorization once more before anything derived from the CV is persisted.
    if (!(await loadConsent(admin, row.organization_id, row.candidate_id))) {
      await markRevoked(admin, row);
      return { insightId, outcome: "revoked" };
    }

    // 5. Status-guarded persist: if revocation (or anything) changed the row meanwhile, this
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

    await auditAsService(admin, "candidate.ai_insight_ready", row, { model: analysis.model });
    return { insightId, outcome: "ready" };
  } catch (error) {
    const failure = safeFailureMessage(error);
    await admin
      .from("candidate_ai_insights")
      .update({ status: "failed", error_message: failure.message })
      .eq("id", row.id)
      .eq("organization_id", row.organization_id)
      .eq("status", "analyzing");
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
