import "server-only";
import type { createServerSupabase } from "@/lib/supabase/server";
import { recordAuditEvent } from "@/server/audit";

/**
 * Revocation behaviour for AI insights (ADR-037/038, docs/AI_INSIGHTS.md §4 and §8.3).
 *
 * CV reasons (authorization revoked, CV deleted) invalidate every insight of the candidate: the
 * CV is the base of every analysis. GitHub reasons (authorization revoked, URL changed or removed)
 * invalidate only insights whose evidence_sources contain `github`, including runs in flight,
 * whose planned sources were written at claim time. In every case the AI-generated content
 * (`result`, `summary`) is cleared and the row is kept (ids, timestamps, attempt counts) for
 * auditability; no derived content survives.
 *
 * Runs through the caller's user-scoped client inside the revoking action, so RLS applies. A run
 * that is `pending`/`analyzing` at this moment is flipped to `revoked`; the runner's
 * status-guarded write (`… WHERE status = 'analyzing'`) then affects zero rows and its result is
 * discarded (docs/AI_INSIGHTS.md §4, "no stale overwrite").
 */

type UserClient = Awaited<ReturnType<typeof createServerSupabase>>;

export type InvalidationReason =
  "authorization_revoked" | "cv_deleted" | "github_revoked" | "github_url_changed";

const REASON_MESSAGE: Record<InvalidationReason, string> = {
  authorization_revoked: "AI authorization was revoked, so the insights were removed.",
  cv_deleted: "The CV was deleted, so the insights were removed.",
  github_revoked:
    "GitHub authorization was revoked, so insights that used GitHub evidence were removed. Generate again for a CV-only analysis.",
  github_url_changed:
    "The GitHub profile URL changed, so insights that used GitHub evidence were removed. Record a new authorization to include it again.",
};

const GITHUB_ONLY_REASONS: ReadonlySet<InvalidationReason> = new Set([
  "github_revoked",
  "github_url_changed",
]);

/** Returns the number of insight rows invalidated (0 when the candidate had none that matched). */
export async function invalidateCandidateInsights(
  supabase: UserClient,
  organizationId: string,
  candidateId: string,
  reason: InvalidationReason,
): Promise<number> {
  let query = supabase
    .from("candidate_ai_insights")
    .update({
      status: "revoked",
      result: null,
      summary: null,
      error_message: REASON_MESSAGE[reason],
    })
    .eq("candidate_id", candidateId)
    .eq("organization_id", organizationId)
    .neq("status", "revoked");
  if (GITHUB_ONLY_REASONS.has(reason)) {
    query = query.contains("evidence_sources", ["github"]);
  }
  const { data, error } = await query.select("id");
  if (error) throw new Error(`insight invalidation failed: ${error.message}`);
  const count = data?.length ?? 0;
  if (count > 0) {
    await recordAuditEvent("candidate.ai_insights_invalidated", {
      organizationId,
      targetType: "candidate",
      targetId: candidateId,
      metadata: { reason, count },
    });
  }
  return count;
}
