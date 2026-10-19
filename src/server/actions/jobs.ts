"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type ActionState, errorState, fieldErrorsFromIssues } from "@/lib/action-state";
import { createServerSupabase } from "@/lib/supabase/server";
import { jobInputSchema } from "@/lib/validation/job";
import { runAction } from "@/server/actions/run";
import { requireOrgAccess } from "@/server/auth";

/**
 * Job mutations. The organization always comes from the URL slug through
 * requireOrgAccess(); nothing in the form can point a write at another tenant, and the
 * RLS `with check` clause rejects it anyway.
 */

function jobFields(formData: FormData) {
  return {
    title: formData.get("title"),
    description: formData.get("description") ?? undefined,
    location: formData.get("location"),
    employmentType: formData.get("employmentType"),
    status: formData.get("status") ?? undefined,
  };
}

/** Everything under /o/<slug> shows counts or lists that a job change can affect. */
function revalidateWorkspace(orgSlug: string) {
  revalidatePath(`/o/${orgSlug}`, "layout");
}

export async function createJobAction(
  orgSlug: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const organization = await requireOrgAccess(orgSlug);
    const parsed = jobInputSchema.safeParse(jobFields(formData));
    if (!parsed.success) {
      return errorState("Check the highlighted fields", fieldErrorsFromIssues(parsed.error.issues));
    }
    const supabase = await createServerSupabase();
    const { data, error } = await supabase
      .from("jobs")
      .insert({
        organization_id: organization.id,
        title: parsed.data.title,
        description: parsed.data.description,
        location: parsed.data.location ?? null,
        employment_type: parsed.data.employmentType ?? null,
        status: parsed.data.status,
        created_by: organization.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(`job insert failed: ${error.message}`);
    revalidateWorkspace(orgSlug);
    redirect(`/o/${orgSlug}/jobs/${data.id}`);
  });
}

export async function updateJobAction(
  orgSlug: string,
  jobId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const organization = await requireOrgAccess(orgSlug);
    const parsed = jobInputSchema.safeParse(jobFields(formData));
    if (!parsed.success) {
      return errorState("Check the highlighted fields", fieldErrorsFromIssues(parsed.error.issues));
    }
    const supabase = await createServerSupabase();
    const { data, error } = await supabase
      .from("jobs")
      .update({
        title: parsed.data.title,
        description: parsed.data.description,
        location: parsed.data.location ?? null,
        employment_type: parsed.data.employmentType ?? null,
        status: parsed.data.status,
      })
      .eq("id", jobId)
      .eq("organization_id", organization.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`job update failed: ${error.message}`);
    if (!data) return errorState("This job no longer exists");
    revalidateWorkspace(orgSlug);
    redirect(`/o/${orgSlug}/jobs/${jobId}`);
  });
}

/** Deletes a job and, by cascade, its applications. Called from a confirmed form submit. */
export async function deleteJobAction(orgSlug: string, jobId: string): Promise<void> {
  const organization = await requireOrgAccess(orgSlug);
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("jobs")
    .delete()
    .eq("id", jobId)
    .eq("organization_id", organization.id);
  if (error) throw new Error(`job delete failed: ${error.message}`);
  revalidateWorkspace(orgSlug);
  redirect(`/o/${orgSlug}/jobs`);
}
