"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type ActionState, errorState, fieldErrorsFromIssues } from "@/lib/action-state";
import { createServerSupabase } from "@/lib/supabase/server";
import { candidateInputSchema, createCandidateSchema } from "@/lib/validation/candidate";
import {
  buildCvObjectKey,
  CV_BUCKET,
  CV_CONTENT_TYPE,
  hasPdfSignature,
  validateCvMetadata,
} from "@/lib/validation/cv";
import { runAction } from "@/server/actions/run";
import { recordAuditEvent } from "@/server/audit";
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

    // Optional CV at creation time: validate the file fully before creating anything, so an
    // invalid upload never leaves a half-created candidate.
    const file = formData.get("cv");
    let cvBytes: Uint8Array | null = null;
    let cvFilename: string | null = null;
    if (file instanceof File && file.size > 0) {
      const metadata = validateCvMetadata({ name: file.name, type: file.type, size: file.size });
      if (!metadata.ok) return errorState(metadata.message, { cv: [metadata.message] });
      cvBytes = new Uint8Array(await file.arrayBuffer());
      if (!hasPdfSignature(cvBytes.subarray(0, 5))) {
        return errorState("That file is not a valid PDF.", { cv: ["Not a valid PDF"] });
      }
      cvFilename = metadata.filename;
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

    // Store the CV last. If anything fails, roll the candidate back (cascades the application)
    // so creation stays atomic: either the candidate and CV exist, or neither does.
    if (cvBytes && cvFilename) {
      const key = buildCvObjectKey(organization.id, data.id, crypto.randomUUID());
      const upload = await supabase.storage
        .from(CV_BUCKET)
        .upload(key, cvBytes, { contentType: CV_CONTENT_TYPE, upsert: false });
      const { error: cvError } = upload.error
        ? { error: upload.error }
        : await supabase
            .from("candidates")
            .update({
              cv_object_key: key,
              cv_filename: cvFilename,
              cv_size_bytes: cvBytes.byteLength,
              cv_uploaded_at: new Date().toISOString(),
              cv_uploaded_by: organization.userId,
              cv_source: "candidate_provided_recruiter_upload",
            })
            .eq("id", data.id)
            .eq("organization_id", organization.id);
      if (cvError) {
        if (!upload.error) await supabase.storage.from(CV_BUCKET).remove([key]);
        await supabase
          .from("candidates")
          .delete()
          .eq("id", data.id)
          .eq("organization_id", organization.id);
        return errorState("Could not store the CV, so the candidate was not created. Try again.", {
          cv: ["Upload failed"],
        });
      }
      await recordAuditEvent("candidate.cv_uploaded", {
        organizationId: organization.id,
        targetType: "candidate",
        targetId: data.id,
      });
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
  // Read the CV key first so the storage object can be removed after the row is gone; the
  // database cascade does not reach Storage, so this prevents an orphaned CV file.
  const { data: candidate } = await supabase
    .from("candidates")
    .select("cv_object_key")
    .eq("id", candidateId)
    .eq("organization_id", organization.id)
    .maybeSingle();
  const { error } = await supabase
    .from("candidates")
    .delete()
    .eq("id", candidateId)
    .eq("organization_id", organization.id);
  if (error) throw new Error(`candidate delete failed: ${error.message}`);
  if (candidate?.cv_object_key) {
    await supabase.storage.from(CV_BUCKET).remove([candidate.cv_object_key]);
  }
  revalidateWorkspace(orgSlug);
  redirect(`/o/${orgSlug}/candidates`);
}
