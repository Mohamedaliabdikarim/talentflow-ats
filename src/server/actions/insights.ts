"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionState, errorState } from "@/lib/action-state";
import { createServerSupabase } from "@/lib/supabase/server";
import { runAction } from "@/server/actions/run";
import { requireOrgAccess } from "@/server/auth";
import { getLatestApplicationInsight, type InsightView } from "@/server/data/insights";
import { enqueueJobMatchInsight } from "@/server/insights/queue";

/**
 * Candidate Insights actions (ADR-035). Both guard with requireOrgAccess first and read/write only
 * through the user-scoped client, so tenant isolation is enforced by RLS on every call. Neither
 * action calls the model: generation is queued here and performed by the runner.
 */

const idSchema = z.uuid();

// Not exported: a "use server" module may only export async functions.
const AUTHORIZATION_REQUIRED_MESSAGE =
  "The candidate has not authorized AI analysis of their CV. Record the authorization on the candidate page first.";

/** Queues a (re)analysis for an application; used by Generate, Regenerate and Retry. */
export async function generateApplicationInsightsAction(
  orgSlug: string,
  applicationId: string,
): Promise<ActionState<{ insightId: string | null }>> {
  return runAction<{ insightId: string | null }>(async () => {
    const organization = await requireOrgAccess(orgSlug);
    if (!idSchema.safeParse(applicationId).success) {
      return errorState("This application no longer exists.");
    }
    const supabase = await createServerSupabase();
    const outcome = await enqueueJobMatchInsight({ supabase, organization, applicationId });
    switch (outcome.outcome) {
      case "enqueued":
        revalidatePath(`/o/${orgSlug}/applications/${applicationId}`);
        return {
          status: "success",
          message: "Analysis started.",
          data: { insightId: outcome.insightId },
        };
      case "already_active":
        return {
          status: "success",
          message: "An analysis is already in progress.",
          data: { insightId: outcome.insightId },
        };
      case "authorization_required":
        return errorState(AUTHORIZATION_REQUIRED_MESSAGE);
      case "not_found":
        return errorState("This application no longer exists.");
    }
  });
}

/** Current state of the latest analysis; polled by the panel while a run is in progress. */
export async function getApplicationInsightAction(
  orgSlug: string,
  applicationId: string,
): Promise<ActionState<InsightView | null>> {
  return runAction<InsightView | null>(async () => {
    const organization = await requireOrgAccess(orgSlug);
    if (!idSchema.safeParse(applicationId).success) {
      return errorState("This application no longer exists.");
    }
    const insight = await getLatestApplicationInsight(organization.id, applicationId);
    return { status: "success", data: insight };
  });
}
