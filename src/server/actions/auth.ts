"use server";

import { redirect } from "next/navigation";
import { type ActionState, errorState, fieldErrorsFromIssues } from "@/lib/action-state";
import { resolveLandingPath } from "@/lib/landing";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { loginSchema, safeRedirectPath, setPasswordSchema } from "@/lib/validation/auth";
import { runAction } from "@/server/actions/run";
import { recordAuditEvent } from "@/server/audit";
import { getMyOrganizations, isPlatformAdmin, requireUser } from "@/server/auth";

export async function signInAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const parsed = loginSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });
    if (!parsed.success) {
      return errorState("Check the highlighted fields", fieldErrorsFromIssues(parsed.error.issues));
    }

    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) {
      // One generic message: do not reveal whether the email exists.
      return errorState("Invalid email or password");
    }

    await recordAuditEvent("auth.signed_in");
    const next = safeRedirectPath(formData.get("next"), "");
    redirect(next || (await landingPath()));
  });
}

export async function signOutAction(): Promise<void> {
  const supabase = await createServerSupabase();
  await recordAuditEvent("auth.signed_out");
  await supabase.auth.signOut();
  redirect("/login");
}

/** First-time password for invited users; also activates their pending memberships. */
export async function setPasswordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser("/auth/set-password", { allowWithoutPassword: true });
    const parsed = setPasswordSchema.safeParse({
      password: formData.get("password"),
      confirmPassword: formData.get("confirmPassword"),
    });
    if (!parsed.success) {
      return errorState("Check the highlighted fields", fieldErrorsFromIssues(parsed.error.issues));
    }

    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) {
      return errorState(error.message);
    }

    // Record that the user has established their own password, so the set-password step
    // cannot be skipped on future sessions (ADR-030). app_metadata is writable only by the
    // service role, so the flag cannot be forged by a user; we merge to preserve the
    // provider keys GoTrue keeps there. This runs only for the caller's own account.
    const admin = createAdminSupabase();
    const { data: existing, error: lookupError } = await admin.auth.admin.getUserById(user.id);
    if (lookupError) {
      return errorState(
        "Your password was saved, but finishing setup failed. Please sign in again.",
      );
    }
    const { error: flagError } = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { ...(existing.user?.app_metadata ?? {}), password_set: true },
    });
    if (flagError) {
      return errorState(
        "Your password was saved, but finishing setup failed. Please sign in again.",
      );
    }
    await recordAuditEvent("auth.password_established");

    const { data: activated } = await supabase.rpc("activate_my_memberships");
    if (typeof activated === "number" && activated > 0) {
      await recordAuditEvent("membership.activated", { metadata: { count: activated } });
    }
    redirect(await landingPath());
  });
}

async function landingPath(): Promise<string> {
  const [admin, organizations] = await Promise.all([isPlatformAdmin(), getMyOrganizations()]);
  return resolveLandingPath({
    isPlatformAdmin: admin,
    organizationSlugs: organizations.map((organization) => organization.slug),
  });
}
