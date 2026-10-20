"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type ActionState, errorState, fieldErrorsFromIssues } from "@/lib/action-state";
import { getPublicEnv } from "@/lib/env";
import { buildInviteUrl, type InviteLinkType } from "@/lib/invite";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  createOrganizationSchema,
  grantPlatformAdminSchema,
  inviteUserSchema,
  reissueInvitationSchema,
} from "@/lib/validation/admin";
import { slugify } from "@/lib/validation/organization";
import { runAction } from "@/server/actions/run";
import { recordAuditEvent } from "@/server/audit";
import { requirePlatformAdmin } from "@/server/auth";

/**
 * Platform-admin provisioning actions (ADR-006, ADR-007).
 *
 * Every action first calls requirePlatformAdmin() through the user-scoped client (database
 * backed) and only then touches the service-role client. Audit rows are written through the
 * user-scoped client so the actor is auth.uid(). Invitation links are returned to the
 * caller exactly once and are never logged.
 */

const UNIQUE_VIOLATION = "23505";

export type InviteResult = {
  inviteUrl: string;
  linkType: InviteLinkType;
  /** True when the user already had an account and was added directly as an active member. */
  existingUser: boolean;
};

export async function createOrganizationAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const admin = await requirePlatformAdmin();
    const parsed = createOrganizationSchema.safeParse({
      name: formData.get("name"),
      slug: formData.get("slug"),
    });
    if (!parsed.success) {
      return errorState("Check the highlighted fields", fieldErrorsFromIssues(parsed.error.issues));
    }
    const slug = parsed.data.slug ?? slugify(parsed.data.name);
    if (slug.length < 2) {
      return errorState("Could not derive a slug from that name; enter one manually", {
        slug: ["Use lowercase letters, digits and single hyphens"],
      });
    }

    const service = createAdminSupabase();
    const { data, error } = await service
      .from("organizations")
      .insert({ name: parsed.data.name, slug, created_by: admin.id })
      .select("id, slug")
      .single();
    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        return errorState("That slug is already in use", { slug: ["Choose a different slug"] });
      }
      throw new Error(`organization insert failed: ${error.message}`);
    }

    await recordAuditEvent("organization.created", {
      organizationId: data.id,
      targetType: "organization",
      targetId: data.id,
    });
    revalidatePath("/admin");
    revalidatePath("/admin/organizations");
    redirect(`/admin/organizations/${data.id}`);
  });
}

export async function inviteUserAction(
  _previous: ActionState<InviteResult>,
  formData: FormData,
): Promise<ActionState<InviteResult>> {
  return runAction<InviteResult>(async () => {
    const admin = await requirePlatformAdmin();
    const parsed = inviteUserSchema.safeParse({
      organizationId: formData.get("organizationId"),
      email: formData.get("email"),
      fullName: formData.get("fullName"),
      role: formData.get("role") ?? undefined,
    });
    if (!parsed.success) {
      return errorState("Check the highlighted fields", fieldErrorsFromIssues(parsed.error.issues));
    }
    const { organizationId, email, fullName, role } = parsed.data;

    const service = createAdminSupabase();
    const link = await generateUserLink(service, email, fullName);
    if (!link.ok) return errorState(link.message);

    const { error: membershipError } = await service.from("organization_memberships").insert({
      organization_id: organizationId,
      user_id: link.userId,
      role,
      // New users activate their membership when they set a password; existing users can
      // sign in already, so their membership is active immediately.
      status: link.existingUser ? "active" : "invited",
      invited_by: admin.id,
    });
    if (membershipError) {
      if (membershipError.code === UNIQUE_VIOLATION) {
        return errorState("That person is already a member of this organization");
      }
      throw new Error(`membership insert failed: ${membershipError.message}`);
    }

    await recordAuditEvent("user.invited", {
      organizationId,
      targetType: "user",
      targetId: link.userId,
      metadata: { role, existing_user: link.existingUser },
    });
    revalidatePath(`/admin/organizations/${organizationId}`);

    const inviteUrl = buildInviteUrl(
      getPublicEnv().NEXT_PUBLIC_APP_URL,
      link.tokenHash,
      link.linkType,
      link.existingUser ? "/app" : "/auth/set-password",
    );
    return {
      status: "success",
      message: link.existingUser
        ? "Added as an active member. Share the sign-in link if they need one."
        : "Invitation created. Copy the link now; it is shown only once.",
      data: { inviteUrl, linkType: link.linkType, existingUser: link.existingUser },
    };
  });
}

/**
 * Reissues a one-time invitation link for a membership that is still PENDING ('invited'),
 * for use when the original link expired or was lost. It never creates or modifies a
 * membership row: it only generates a fresh token for the already-invited account, so the
 * unique (organization_id, user_id) membership is untouched and an active membership can
 * never be re-invited or downgraded through this path. Generating the token invalidates any
 * earlier link, so an expired or already-used link fails safely at /auth/confirm.
 */
export async function reissueInvitationAction(
  _previous: ActionState<InviteResult>,
  formData: FormData,
): Promise<ActionState<InviteResult>> {
  return runAction<InviteResult>(async () => {
    await requirePlatformAdmin();
    const parsed = reissueInvitationSchema.safeParse({
      membershipId: formData.get("membershipId"),
    });
    if (!parsed.success) {
      return errorState("Check the highlighted fields", fieldErrorsFromIssues(parsed.error.issues));
    }

    const service = createAdminSupabase();
    const { data: membership, error: lookupError } = await service
      .from("organization_memberships")
      .select("id, organization_id, user_id, status")
      .eq("id", parsed.data.membershipId)
      .maybeSingle();
    if (lookupError) throw new Error(`membership lookup failed: ${lookupError.message}`);
    if (!membership) {
      return errorState("No invitation found for that member.");
    }
    if (membership.status !== "invited") {
      return errorState(
        "That member is already active, so there is no pending invitation to resend.",
      );
    }

    const { data: account, error: userError } = await service.auth.admin.getUserById(
      membership.user_id,
    );
    if (userError || !account.user?.email) {
      return errorState("Could not find the invited account to reissue a link for.");
    }

    const link = await generateUserLink(service, account.user.email, undefined);
    if (!link.ok) return errorState(link.message);

    await recordAuditEvent("user.invite_reissued", {
      organizationId: membership.organization_id,
      targetType: "user",
      targetId: membership.user_id,
    });
    revalidatePath(`/admin/organizations/${membership.organization_id}`);

    const inviteUrl = buildInviteUrl(
      getPublicEnv().NEXT_PUBLIC_APP_URL,
      link.tokenHash,
      link.linkType,
      "/auth/set-password",
    );
    return {
      status: "success",
      message: "New invitation link created. Copy it now; it is shown only once.",
      data: { inviteUrl, linkType: link.linkType, existingUser: false },
    };
  });
}

export async function grantPlatformAdminAction(
  _previous: ActionState<InviteResult | null>,
  formData: FormData,
): Promise<ActionState<InviteResult | null>> {
  return runAction<InviteResult | null>(async () => {
    const admin = await requirePlatformAdmin();
    const parsed = grantPlatformAdminSchema.safeParse({
      email: formData.get("email"),
      fullName: formData.get("fullName"),
      note: formData.get("note"),
    });
    if (!parsed.success) {
      return errorState("Check the highlighted fields", fieldErrorsFromIssues(parsed.error.issues));
    }
    const { email, fullName, note } = parsed.data;

    const service = createAdminSupabase();
    const link = await generateUserLink(service, email, fullName);
    if (!link.ok) return errorState(link.message);

    const { error } = await service
      .from("platform_admins")
      .insert({ user_id: link.userId, granted_by: admin.id, note: note ?? null });
    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        return errorState("That person is already a platform admin");
      }
      throw new Error(`platform_admins insert failed: ${error.message}`);
    }

    await recordAuditEvent("admin.granted", {
      targetType: "user",
      targetId: link.userId,
      metadata: { existing_user: link.existingUser },
    });
    revalidatePath("/admin/admins");

    if (link.existingUser) {
      return { status: "success", message: "Platform admin rights granted.", data: null };
    }
    const inviteUrl = buildInviteUrl(
      getPublicEnv().NEXT_PUBLIC_APP_URL,
      link.tokenHash,
      link.linkType,
      "/auth/set-password",
    );
    return {
      status: "success",
      message: "Admin account created. Copy the link now; it is shown only once.",
      data: { inviteUrl, linkType: link.linkType, existingUser: false },
    };
  });
}

type UserLink =
  | { ok: true; userId: string; tokenHash: string; linkType: InviteLinkType; existingUser: boolean }
  | { ok: false; message: string };

/**
 * Creates the auth user with an invite token, or, when the account already exists, a
 * magic-link token. Both tokens are single-use and expire per project settings.
 */
async function generateUserLink(
  service: ReturnType<typeof createAdminSupabase>,
  email: string,
  fullName: string | undefined,
): Promise<UserLink> {
  const invite = await service.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: { full_name: fullName ?? "" } },
  });
  if (!invite.error && invite.data.user && invite.data.properties?.hashed_token) {
    return {
      ok: true,
      userId: invite.data.user.id,
      tokenHash: invite.data.properties.hashed_token,
      linkType: "invite",
      existingUser: false,
    };
  }
  if (invite.error && invite.error.code !== "email_exists") {
    return { ok: false, message: `Could not create the invitation: ${invite.error.message}` };
  }

  const magic = await service.auth.admin.generateLink({ type: "magiclink", email });
  if (magic.error || !magic.data.user || !magic.data.properties?.hashed_token) {
    return {
      ok: false,
      message: `Could not create a sign-in link: ${magic.error?.message ?? "unknown error"}`,
    };
  }
  // An account that exists but has never signed in (an earlier invitation that was never
  // used) is still a pending invite: it must set a password before it can act.
  const hasSignedInBefore = Boolean(magic.data.user.last_sign_in_at);
  return {
    ok: true,
    userId: magic.data.user.id,
    tokenHash: magic.data.properties.hashed_token,
    linkType: "magiclink",
    existingUser: hasSignedInBefore,
  };
}
