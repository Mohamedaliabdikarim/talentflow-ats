import "server-only";
import { after } from "next/server";
import { getServerEnv } from "@/lib/env";
import type { createServerSupabase } from "@/lib/supabase/server";
import { recordAuditEvent } from "@/server/audit";
import type { OrganizationContext } from "@/server/auth";

/**
 * Enqueueing a Job Match analysis (docs/AI_INSIGHTS.md §4–5, ADR-035/036).
 *
 * The durable unit of work is the `pending` row in candidate_ai_insights. This module writes it
 * through the caller's user-scoped client (so RLS and the composite foreign keys apply) after
 * checking the candidate's AI authorization, and then kicks the runner endpoint best-effort.
 * It never touches the model and never reads the CV.
 */

type UserClient = Awaited<ReturnType<typeof createServerSupabase>>;

const UNIQUE_VIOLATION = "23505";

export type EnqueueOutcome =
  | { outcome: "enqueued"; insightId: string }
  /** An analysis for this application is already pending or running (one active run at a time). */
  | { outcome: "already_active"; insightId: string | null }
  /** The candidate has no CV or has not authorized AI analysis of it; nothing is queued. */
  | { outcome: "authorization_required" }
  | { outcome: "not_found" };

export async function enqueueJobMatchInsight(params: {
  supabase: UserClient;
  organization: OrganizationContext;
  applicationId: string;
}): Promise<EnqueueOutcome> {
  const { supabase, organization, applicationId } = params;

  const { data: application, error: applicationError } = await supabase
    .from("applications")
    .select("id, candidate_id, job_id")
    .eq("id", applicationId)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (applicationError) throw new Error(`application lookup failed: ${applicationError.message}`);
  if (!application) return { outcome: "not_found" };

  const { data: candidate, error: candidateError } = await supabase
    .from("candidates")
    .select("id, cv_object_key, cv_ai_authorized, cv_ai_authorized_at")
    .eq("id", application.candidate_id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (candidateError) throw new Error(`candidate lookup failed: ${candidateError.message}`);
  if (!candidate) return { outcome: "not_found" };
  if (!candidate.cv_ai_authorized || !candidate.cv_object_key) {
    return { outcome: "authorization_required" };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("candidate_ai_insights")
    .insert({
      organization_id: organization.id,
      candidate_id: application.candidate_id,
      job_id: application.job_id,
      application_id: application.id,
      analysis_type: "job_match",
      status: "pending",
      cv_consent_at: candidate.cv_ai_authorized_at,
      human_review_required: true,
      created_by: organization.userId,
    })
    .select("id")
    .maybeSingle();

  if (insertError) {
    if (insertError.code === UNIQUE_VIOLATION) {
      // candidate_ai_insights_one_active_per_application: a run is already pending/analyzing.
      const { data: active } = await supabase
        .from("candidate_ai_insights")
        .select("id")
        .eq("application_id", application.id)
        .eq("organization_id", organization.id)
        .in("status", ["pending", "analyzing"])
        .limit(1)
        .maybeSingle();
      return { outcome: "already_active", insightId: active?.id ?? null };
    }
    throw new Error(`insight enqueue failed: ${insertError.message}`);
  }
  if (!inserted) throw new Error("insight enqueue returned no row");

  await recordAuditEvent("candidate.ai_insight_requested", {
    organizationId: organization.id,
    targetType: "candidate_ai_insight",
    targetId: inserted.id,
    metadata: { candidate_id: application.candidate_id, application_id: application.id },
  });
  kickInsightsRunner(inserted.id);
  return { outcome: "enqueued", insightId: inserted.id };
}

/**
 * Best-effort, immediate kick of the runner endpoint after the current response is sent.
 * Not a durability mechanism: if it is lost, the row stays `pending` for the scheduled run or a
 * manual retry (ADR-036). Returns false (and does nothing) when no runner secret is configured.
 */
export function kickInsightsRunner(insightId: string): boolean {
  const env = getServerEnv();
  const secret = env.INSIGHTS_RUNNER_SECRET;
  if (!secret) return false;
  const url = new URL("/api/insights/run", env.NEXT_PUBLIC_APP_URL).toString();
  after(async () => {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-insights-secret": secret },
        body: JSON.stringify({ insightId }),
        cache: "no-store",
      });
      if (!response.ok) {
        console.error(`[insights] runner kick for ${insightId} returned HTTP ${response.status}`);
      }
    } catch (error) {
      console.error(
        `[insights] runner kick for ${insightId} failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  });
  return true;
}
