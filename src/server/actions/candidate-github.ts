"use server";

import { revalidatePath } from "next/cache";
import { type ActionState, errorState, fieldErrorsFromIssues } from "@/lib/action-state";
import { parseGithubProfileUrl } from "@/lib/github/profile";
import { createServerSupabase } from "@/lib/supabase/server";
import { cvAiAuthorizationSchema } from "@/lib/validation/candidate";
import { runAction } from "@/server/actions/run";
import { recordAuditEvent } from "@/server/audit";
import { requireOrgAccess } from "@/server/auth";
import { invalidateCandidateInsights } from "@/server/insights/invalidate";

/**
 * AI-use authorization for the candidate's public GitHub profile (ADR-038, docs/AI_INSIGHTS.md
 * §8.1). Mirrors the CV consent actions: requireOrgAccess first, the user-scoped client (RLS),
 * an explicit confirmation that is never pre-checked, a stated basis, and audit metadata that
 * carries ids only. The URL itself comes from the profile; it is never changed here.
 */

/** Records authorization to use the exact GitHub profile on file as AI evidence. */
export async function authorizeCandidateGithubAiAction(
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
    const { data: candidate, error: lookupError } = await supabase
      .from("candidates")
      .select("id, github_url")
      .eq("id", candidateId)
      .eq("organization_id", organization.id)
      .maybeSingle();
    if (lookupError) throw new Error(`candidate lookup failed: ${lookupError.message}`);
    if (!candidate) return errorState("This candidate no longer exists.");
    if (!candidate.github_url) {
      return errorState(
        "Add a GitHub profile URL to the candidate before recording authorization.",
      );
    }
    if (!parseGithubProfileUrl(candidate.github_url)) {
      return errorState(
        "The stored GitHub URL is not a profile URL. Correct it on the Edit page first.",
      );
    }

    const { data: updated, error } = await supabase
      .from("candidates")
      .update({
        github_ai_authorized: true,
        github_ai_authorized_at: new Date().toISOString(),
        github_ai_authorized_by: organization.userId,
        github_ai_authorization_basis: parsed.data.basis,
      })
      .eq("id", candidateId)
      .eq("organization_id", organization.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`github ai authorization failed: ${error.message}`);
    if (!updated) return errorState("This candidate no longer exists.");

    await recordAuditEvent("candidate.github_ai_authorized", {
      organizationId: organization.id,
      targetType: "candidate",
      targetId: candidateId,
    });
    revalidatePath(`/o/${orgSlug}/candidates/${candidateId}`);
    return {
      status: "success",
      message: "GitHub evidence authorized.",
      data: undefined,
    } satisfies ActionState;
  });
}

/** Revokes GitHub authorization and removes every insight that used GitHub evidence. */
export async function revokeCandidateGithubAiAction(
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
        github_ai_authorized: false,
        github_ai_authorized_at: null,
        github_ai_authorized_by: null,
        github_ai_authorization_basis: null,
      })
      .eq("id", candidateId)
      .eq("organization_id", organization.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`github ai revoke failed: ${error.message}`);
    if (!updated) return errorState("This candidate no longer exists.");

    // Consent is cleared first; then every GitHub-sourced insight loses its content (ADR-038).
    await invalidateCandidateInsights(supabase, organization.id, candidateId, "github_revoked");

    await recordAuditEvent("candidate.github_ai_revoked", {
      organizationId: organization.id,
      targetType: "candidate",
      targetId: candidateId,
    });
    revalidatePath(`/o/${orgSlug}/candidates/${candidateId}`);
    return {
      status: "success",
      message: "GitHub authorization revoked.",
      data: undefined,
    } satisfies ActionState;
  });
}
