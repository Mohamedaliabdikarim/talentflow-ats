"use server";

import { revalidatePath } from "next/cache";
import { type ActionState, errorState, fieldErrorsFromIssues } from "@/lib/action-state";
import { createServerSupabase } from "@/lib/supabase/server";
import { cvAiAuthorizationSchema } from "@/lib/validation/candidate";
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
import { invalidateCandidateInsights } from "@/server/insights/invalidate";

/**
 * Candidate CV (PDF) upload, replace, delete and AI-use consent (ADR-033, docs/SECURITY.md §9).
 *
 * Every action calls requireOrgAccess first (application layer) and then uses the user-scoped
 * client, so the candidates RLS policy and the storage.objects policy both apply: three layers
 * guard tenant isolation. Files live in a private bucket; nothing here ever builds a public URL.
 * Audit metadata carries ids only, never a filename, URL or document content.
 */

type CandidateCvRow = { id: string; cv_object_key: string | null };

async function loadCandidate(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  organizationId: string,
  candidateId: string,
): Promise<CandidateCvRow | null> {
  const { data, error } = await supabase
    .from("candidates")
    .select("id, cv_object_key")
    .eq("id", candidateId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(`candidate lookup failed: ${error.message}`);
  return data;
}

/** Uploads a new CV, or replaces an existing one. Resets AI authorization to false. */
export async function uploadCandidateCvAction(
  orgSlug: string,
  candidateId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction<undefined>(async () => {
    const organization = await requireOrgAccess(orgSlug);
    const file = formData.get("cv");
    if (!(file instanceof File) || file.size === 0) {
      return errorState("Choose a PDF file to upload.", { cv: ["Choose a PDF file"] });
    }
    const metadata = validateCvMetadata({ name: file.name, type: file.type, size: file.size });
    if (!metadata.ok) return errorState(metadata.message, { cv: [metadata.message] });

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!hasPdfSignature(bytes.subarray(0, 5))) {
      return errorState("That file is not a valid PDF.", { cv: ["Not a valid PDF"] });
    }

    const supabase = await createServerSupabase();
    const candidate = await loadCandidate(supabase, organization.id, candidateId);
    if (!candidate) return errorState("This candidate no longer exists.");
    const previousKey = candidate.cv_object_key;

    const key = buildCvObjectKey(organization.id, candidateId, crypto.randomUUID());
    const upload = await supabase.storage
      .from(CV_BUCKET)
      .upload(key, bytes, { contentType: CV_CONTENT_TYPE, upsert: false });
    if (upload.error) throw new Error(`cv upload failed: ${upload.error.message}`);

    const { data: updated, error } = await supabase
      .from("candidates")
      .update({
        cv_object_key: key,
        cv_filename: metadata.filename,
        cv_size_bytes: metadata.size,
        cv_uploaded_at: new Date().toISOString(),
        cv_uploaded_by: organization.userId,
        cv_source: "candidate_provided_recruiter_upload",
        // A new CV is new candidate-supplied information: AI authorization must be re-recorded.
        cv_ai_authorized: false,
        cv_ai_authorized_at: null,
        cv_ai_authorized_by: null,
        cv_ai_authorization_basis: null,
      })
      .eq("id", candidateId)
      .eq("organization_id", organization.id)
      .select("id")
      .maybeSingle();

    if (error || !updated) {
      // Compensate: the metadata did not land, so remove the object we just wrote (no orphan).
      await supabase.storage.from(CV_BUCKET).remove([key]);
      if (!updated && !error) return errorState("This candidate no longer exists.");
      throw new Error(`cv metadata update failed: ${error?.message}`);
    }

    // The row now points at the new object; remove the old one (best effort; a rare orphan is
    // tolerated rather than failing the user-visible action, see docs/SECURITY.md §9).
    if (previousKey && previousKey !== key) {
      await supabase.storage.from(CV_BUCKET).remove([previousKey]);
    }

    await recordAuditEvent(previousKey ? "candidate.cv_replaced" : "candidate.cv_uploaded", {
      organizationId: organization.id,
      targetType: "candidate",
      targetId: candidateId,
    });
    revalidatePath(`/o/${orgSlug}/candidates/${candidateId}`);
    return {
      status: "success",
      message: previousKey ? "CV replaced." : "CV uploaded.",
      data: undefined,
    } satisfies ActionState;
  });
}

/** Deletes the CV: clears the metadata (and any consent) first, then removes the object. */
export async function deleteCandidateCvAction(
  orgSlug: string,
  candidateId: string,
  _previous: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  return runAction<undefined>(async () => {
    const organization = await requireOrgAccess(orgSlug);
    const supabase = await createServerSupabase();
    const candidate = await loadCandidate(supabase, organization.id, candidateId);
    if (!candidate) return errorState("This candidate no longer exists.");
    if (!candidate.cv_object_key) return errorState("There is no CV to delete.");

    // Clear the row first, so no record ever points at a deleted object. A failure here leaves
    // the CV intact (consistent); a later storage failure leaves a harmless orphan object.
    const { data: updated, error } = await supabase
      .from("candidates")
      .update({
        cv_object_key: null,
        cv_filename: null,
        cv_size_bytes: null,
        cv_uploaded_at: null,
        cv_uploaded_by: null,
        cv_source: null,
        cv_ai_authorized: false,
        cv_ai_authorized_at: null,
        cv_ai_authorized_by: null,
        cv_ai_authorization_basis: null,
      })
      .eq("id", candidateId)
      .eq("organization_id", organization.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`cv metadata clear failed: ${error.message}`);
    if (!updated) return errorState("This candidate no longer exists.");

    // Insights derived from this CV lose their basis with it (ADR-037).
    await invalidateCandidateInsights(supabase, organization.id, candidateId, "cv_deleted");

    await supabase.storage.from(CV_BUCKET).remove([candidate.cv_object_key]);

    await recordAuditEvent("candidate.cv_deleted", {
      organizationId: organization.id,
      targetType: "candidate",
      targetId: candidateId,
    });
    revalidatePath(`/o/${orgSlug}/candidates/${candidateId}`);
    return { status: "success", message: "CV deleted.", data: undefined } satisfies ActionState;
  });
}

/** Records AI-use authorization for the current CV (who, when, basis). Never pre-checked. */
export async function authorizeCandidateCvAiAction(
  orgSlug: string,
  candidateId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction<undefined>(async () => {
    const organization = await requireOrgAccess(orgSlug);
    const parsed = cvAiAuthorizationSchema.safeParse({
      confirm: formData.get("confirm"),
      basis: formData.get("basis"),
    });
    if (!parsed.success) {
      return errorState("Check the highlighted fields", fieldErrorsFromIssues(parsed.error.issues));
    }
    const supabase = await createServerSupabase();
    const candidate = await loadCandidate(supabase, organization.id, candidateId);
    if (!candidate) return errorState("This candidate no longer exists.");
    if (!candidate.cv_object_key) {
      return errorState("Upload a CV before recording AI authorization.");
    }

    const { data: updated, error } = await supabase
      .from("candidates")
      .update({
        cv_ai_authorized: true,
        cv_ai_authorized_at: new Date().toISOString(),
        cv_ai_authorized_by: organization.userId,
        cv_ai_authorization_basis: parsed.data.basis,
      })
      .eq("id", candidateId)
      .eq("organization_id", organization.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`cv ai authorization failed: ${error.message}`);
    if (!updated) return errorState("This candidate no longer exists.");

    await recordAuditEvent("candidate.cv_ai_authorized", {
      organizationId: organization.id,
      targetType: "candidate",
      targetId: candidateId,
    });
    revalidatePath(`/o/${orgSlug}/candidates/${candidateId}`);
    return {
      status: "success",
      message: "AI analysis authorized.",
      data: undefined,
    } satisfies ActionState;
  });
}

/** Revokes AI-use authorization so any future AI analysis is blocked. */
export async function revokeCandidateCvAiAction(
  orgSlug: string,
  candidateId: string,
  _previous: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  return runAction<undefined>(async () => {
    const organization = await requireOrgAccess(orgSlug);
    const supabase = await createServerSupabase();
    const { data: updated, error } = await supabase
      .from("candidates")
      .update({
        cv_ai_authorized: false,
        cv_ai_authorized_at: null,
        cv_ai_authorized_by: null,
        cv_ai_authorization_basis: null,
      })
      .eq("id", candidateId)
      .eq("organization_id", organization.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`cv ai revoke failed: ${error.message}`);
    if (!updated) return errorState("This candidate no longer exists.");

    // Withdrawn authorization invalidates every existing insight and stops in-flight runs
    // (ADR-037): their status-guarded write then affects no rows.
    await invalidateCandidateInsights(
      supabase,
      organization.id,
      candidateId,
      "authorization_revoked",
    );

    await recordAuditEvent("candidate.cv_ai_revoked", {
      organizationId: organization.id,
      targetType: "candidate",
      targetId: candidateId,
    });
    revalidatePath(`/o/${orgSlug}/candidates/${candidateId}`);
    return {
      status: "success",
      message: "AI authorization revoked.",
      data: undefined,
    } satisfies ActionState;
  });
}
