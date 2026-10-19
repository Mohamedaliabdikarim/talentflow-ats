"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type ActionState, errorState, fieldErrorsFromIssues } from "@/lib/action-state";
import { createServerSupabase } from "@/lib/supabase/server";
import { candidateInputSchema, createCandidateSchema } from "@/lib/validation/candidate";
import { runAction } from "@/server/actions/run";
import { requireOrgAccess } from "@/server/auth";

function candidateFields(formData: FormData) {
  return {
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    headline: formData.get("headline"),
    location: formData.get("location"),
    linkedinUrl: formData.get("linkedinUrl"),
    githubUrl: formData.get("githubUrl"),
    notes: formData.get("notes"),
  };
}

function toRow(input: ReturnType<typeof candidateInputSchema.parse>) {
  return {
    full_name: input.fullName,
    email: input.email ?? null,
    phone: input.phone ?? null,
    headline: input.headline ?? null,
    location: input.location ?? null,
    linkedin_url: input.linkedinUrl ?? null,
    github_url: input.githubUrl ?? null,
    notes: input.notes ?? null,
  };
}

function revalidateWorkspace(orgSlug: string) {
  revalidatePath(`/o/${orgSlug}`, "layout");
}

export async function createCandidateAction(
  orgSlug: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const organization = await requireOrgAccess(orgSlug);
    const parsed = createCandidateSchema.safeParse({
      ...candidateFields(formData),
      jobId: formData.get("jobId"),
    });
    if (!parsed.success) {
      return errorState("Check the highlighted fields", fieldErrorsFromIssues(parsed.error.issues));
    }
    const supabase = await createServerSupabase();

    // Validate the optional job before creating anything so a bad job id leaves no orphan.
    if (parsed.data.jobId) {
      const { data: job } = await supabase
        .from("jobs")
        .select("id")
        .eq("organization_id", organization.id)
        .eq("id", parsed.data.jobId)
        .maybeSingle();
      if (!job) return errorState("Select a job from this workspace", { jobId: ["Unknown job"] });
    }

    const { data, error } = await supabase
      .from("candidates")
      .insert({
        organization_id: organization.id,
        created_by: organization.userId,
        ...toRow(parsed.data),
      })
      .select("id")
      .single();
    if (error) throw new Error(`candidate insert failed: ${error.message}`);

    if (parsed.data.jobId) {
      const { error: applicationError } = await supabase.from("applications").insert({
        organization_id: organization.id,
        job_id: parsed.data.jobId,
        candidate_id: data.id,
        created_by: organization.userId,
      });
      if (applicationError) {
        throw new Error(`application insert failed: ${applicationError.message}`);
      }
    }

    revalidateWorkspace(orgSlug);
    redirect(`/o/${orgSlug}/candidates/${data.id}`);
  });
}

export async function updateCandidateAction(
  orgSlug: string,
  candidateId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const organization = await requireOrgAccess(orgSlug);
    const parsed = candidateInputSchema.safeParse(candidateFields(formData));
    if (!parsed.success) {
      return errorState("Check the highlighted fields", fieldErrorsFromIssues(parsed.error.issues));
    }
    const supabase = await createServerSupabase();
    const { data, error } = await supabase
      .from("candidates")
      .update(toRow(parsed.data))
      .eq("id", candidateId)
      .eq("organization_id", organization.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`candidate update failed: ${error.message}`);
    if (!data) return errorState("This candidate no longer exists");
    revalidateWorkspace(orgSlug);
    redirect(`/o/${orgSlug}/candidates/${candidateId}`);
  });
}

/** Deletes a candidate and, by cascade, their applications and insights. */
export async function deleteCandidateAction(orgSlug: string, candidateId: string): Promise<void> {
  const organization = await requireOrgAccess(orgSlug);
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("candidates")
    .delete()
    .eq("id", candidateId)
    .eq("organization_id", organization.id);
  if (error) throw new Error(`candidate delete failed: ${error.message}`);
  revalidateWorkspace(orgSlug);
  redirect(`/o/${orgSlug}/candidates`);
}
