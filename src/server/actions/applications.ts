"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type ActionState, errorState, fieldErrorsFromIssues } from "@/lib/action-state";
import { createServerSupabase } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/validation/auth";
import {
  createApplicationSchema,
  moveApplicationSchema,
  STAGE_LABELS,
} from "@/lib/validation/application";
import { runAction } from "@/server/actions/run";
import { type OrganizationContext, requireOrgAccess } from "@/server/auth";
import { enqueueJobMatchInsight } from "@/server/insights/queue";

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

function revalidateWorkspace(orgSlug: string) {
  revalidatePath(`/o/${orgSlug}`, "layout");
}

/** Links a candidate to a job (creates the application in stage "new"). */
export async function addToPipelineAction(
  orgSlug: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction<undefined>(async () => {
    const organization = await requireOrgAccess(orgSlug);
    const parsed = createApplicationSchema.safeParse({
      jobId: formData.get("jobId"),
      candidateId: formData.get("candidateId"),
    });
    if (!parsed.success) {
      return errorState("Select a job and a candidate", fieldErrorsFromIssues(parsed.error.issues));
    }
    const supabase = await createServerSupabase();
    const { error } = await supabase.from("applications").insert({
      organization_id: organization.id,
      job_id: parsed.data.jobId,
      candidate_id: parsed.data.candidateId,
      created_by: organization.userId,
    });
    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        return errorState("This candidate is already in that job's pipeline");
      }
      if (error.code === FOREIGN_KEY_VIOLATION) {
        // Composite FK: the job or candidate is not in this organization (or was deleted).
        return errorState("Job or candidate not found in this workspace");
      }
      throw new Error(`application insert failed: ${error.message}`);
    }
    revalidateWorkspace(orgSlug);
    return { status: "success", message: "Added to the pipeline", data: undefined };
  });
}

/** Moves an application to another stage. Called directly from the Kanban client. */
export async function moveApplicationStageAction(
  orgSlug: string,
  input: { applicationId: string; stage: string },
): Promise<ActionState> {
  return runAction<undefined>(async () => {
    const organization = await requireOrgAccess(orgSlug);
    const parsed = moveApplicationSchema.safeParse(input);
    if (!parsed.success) return errorState("Unknown stage");
    const supabase = await createServerSupabase();
    // The current stage is read first so the New → Screening transition can be recognised.
    const { data: current, error: lookupError } = await supabase
      .from("applications")
      .select("stage")
      .eq("id", parsed.data.applicationId)
      .eq("organization_id", organization.id)
      .maybeSingle();
    if (lookupError) throw new Error(`application lookup failed: ${lookupError.message}`);
    if (!current) return errorState("This application no longer exists");

    const { data, error } = await supabase
      .from("applications")
      .update({ stage: parsed.data.stage })
      .eq("id", parsed.data.applicationId)
      .eq("organization_id", organization.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`application update failed: ${error.message}`);
    if (!data) return errorState("This application no longer exists");

    if (current.stage === "new" && parsed.data.stage === "screening") {
      await queueScreeningInsights(supabase, organization, parsed.data.applicationId);
    }
    revalidateWorkspace(orgSlug);
    return {
      status: "success",
      message: `Moved to ${STAGE_LABELS[parsed.data.stage]}`,
      data: undefined,
    };
  });
}

/**
 * Queues Candidate Insights when an application enters Screening from New (ADR-035). The stage
 * change is already committed at this point and must stand whatever happens here, so failures
 * are logged (ids only) and never surfaced as an error for the move. A candidate without an
 * authorized CV simply gets nothing queued; the application page explains why.
 */
async function queueScreeningInsights(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  organization: OrganizationContext,
  applicationId: string,
): Promise<void> {
  try {
    await enqueueJobMatchInsight({ supabase, organization, applicationId });
  } catch (error) {
    console.error(
      `[insights] could not queue analysis for application ${applicationId}: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
}

/** Removes a candidate from a job's pipeline. Called from a confirmed form submit. */
export async function removeApplicationAction(
  orgSlug: string,
  applicationId: string,
  formData: FormData,
): Promise<void> {
  const organization = await requireOrgAccess(orgSlug);
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("applications")
    .delete()
    .eq("id", applicationId)
    .eq("organization_id", organization.id);
  if (error) throw new Error(`application delete failed: ${error.message}`);
  revalidateWorkspace(orgSlug);
  redirect(safeRedirectPath(formData.get("returnTo"), `/o/${orgSlug}/pipeline`));
}
