import "server-only";
import type { createServerSupabase } from "@/lib/supabase/server";
import { recordAuditEvent } from "@/server/audit";

/**
 * Revocation behaviour for AI insights (ADR-037, docs/AI_INSIGHTS.md §4). When AI authorization
 * is withdrawn or the CV is deleted, every insight derived from that CV is marked `revoked` and
 * its AI-generated content (`result`, `summary`) is cleared. Rows are kept (ids, timestamps,
 * attempt counts) for auditability; no derived content survives.
 *
 * Runs through the caller's user-scoped client inside the revoking action, so RLS applies. A run
 * that is `pending`/`analyzing` at this moment is also flipped to `revoked`; the runner's
 * status-guarded write (`… WHERE status = 'analyzing'`) then affects zero rows and its result is
 * discarded (docs/AI_INSIGHTS.md §4, "no stale overwrite").
 */

type UserClient = Awaited<ReturnType<typeof createServerSupabase>>;

export type InvalidationReason = "authorization_revoked" | "cv_deleted";

const REASON_MESSAGE: Record<InvalidationReason, string> = {
  authorization_revoked: "AI authorization was revoked, so the insights were removed.",
  cv_deleted: "The CV was deleted, so the insights were removed.",
};

/** Returns the number of insight rows invalidated (0 when the candidate had none). */
export async function invalidateCandidateInsights(
  supabase: UserClient,
  organizationId: string,
  candidateId: string,
  reason: InvalidationReason,
): Promise<number> {
  const { data, error } = await supabase
    .from("candidate_ai_insights")
    .update({
      status: "revoked",
      result: null,
      summary: null,
      error_message: REASON_MESSAGE[reason],
    })
    .eq("candidate_id", candidateId)
    .eq("organization_id", organizationId)
    .neq("status", "revoked")
    .select("id");
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
