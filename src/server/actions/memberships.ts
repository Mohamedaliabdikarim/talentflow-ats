"use server";

import { revalidatePath } from "next/cache";
import { type ActionState, errorState, fieldErrorsFromIssues } from "@/lib/action-state";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Enums } from "@/lib/supabase/database.types";
import { changeMembershipRoleSchema, setMembershipStatusSchema } from "@/lib/validation/admin";
import { runAction } from "@/server/actions/run";
import { recordAuditEvent } from "@/server/audit";
import { requirePlatformAdmin } from "@/server/auth";

/**
 * Platform-admin membership management (ADR-040): change an active member's role between
 * owner and member, deactivate an active membership, reactivate a deactivated one.
 *
 * Every action calls requirePlatformAdmin() first (user-scoped client, database-backed) and
 * only then uses the service role, exactly like provisioning. The membership is loaded by id
 * and must belong to the organization named in the form, so a stale form can never act on
 * another tenant's row. "Deactivated" is the existing `disabled` status: `is_org_member()` and
 * the server context both require `active`, so access ends at the database the moment the row
 * changes, and `activate_my_memberships()` cannot bring it back (it only flips `invited`).
 *
 * Invariant: an organization keeps at least one active owner. Each write is conditional on the
 * state it was decided upon (`… WHERE status = … AND role = …`), so a concurrent change makes
 * the write affect zero rows instead of applying a stale decision. Audit metadata carries ids
 * only.
 */

const MISSING = "This membership no longer exists.";
const LAST_OWNER =
  "This organization needs at least one active owner. Make another active member an owner first.";
const CHANGED_MEANWHILE = "This membership changed meanwhile. Reload the page and try again.";

type MembershipRow = {
  id: string;
  organization_id: string;
  user_id: string;
  role: Enums<"membership_role">;
  status: Enums<"membership_status">;
};

type Service = ReturnType<typeof createAdminSupabase>;

async function loadMembership(
  service: Service,
  membershipId: string,
  organizationId: string,
): Promise<MembershipRow | null> {
  const { data, error } = await service
    .from("organization_memberships")
    .select("id, organization_id, user_id, role, status")
    .eq("id", membershipId)
    .maybeSingle();
  if (error) throw new Error(`membership lookup failed: ${error.message}`);
  // Same copy for "missing" and "belongs to another organization".
  if (!data || data.organization_id !== organizationId) return null;
  return data;
}

/** True when the organization has an active owner other than `membershipId`. */
async function hasAnotherActiveOwner(
  service: Service,
  organizationId: string,
  membershipId: string,
): Promise<boolean> {
  const { data, error } = await service
    .from("organization_memberships")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("role", "owner")
    .eq("status", "active")
    .neq("id", membershipId)
    .limit(1);
  if (error) throw new Error(`owner lookup failed: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

function revalidate(organizationId: string) {
  revalidatePath(`/admin/organizations/${organizationId}`);
}

/** Changes an active membership's role; refuses to demote the last active owner. */
export async function changeMembershipRoleAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction<undefined>(async () => {
    await requirePlatformAdmin();
    const parsed = changeMembershipRoleSchema.safeParse({
      organizationId: formData.get("organizationId"),
      membershipId: formData.get("membershipId"),
      role: formData.get("role"),
    });
    if (!parsed.success) {
      return errorState("Check the request", fieldErrorsFromIssues(parsed.error.issues));
    }
    const { organizationId, membershipId, role } = parsed.data;
    const service = createAdminSupabase();
    const membership = await loadMembership(service, membershipId, organizationId);
    if (!membership) return errorState(MISSING);
    if (membership.status !== "active") {
      return errorState("Only active members can change role.");
    }
    if (membership.role === role) {
      return { status: "success", message: "No change: the role is already set.", data: undefined };
    }
    if (
      membership.role === "owner" &&
      !(await hasAnotherActiveOwner(service, organizationId, membershipId))
    ) {
      return errorState(LAST_OWNER);
    }

    const { data: updated, error } = await service
      .from("organization_memberships")
      .update({ role })
      .eq("id", membershipId)
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .eq("role", membership.role)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`membership role update failed: ${error.message}`);
    if (!updated) return errorState(CHANGED_MEANWHILE);

    await recordAuditEvent("membership.role_changed", {
      organizationId,
      targetType: "membership",
      targetId: membershipId,
      metadata: { user_id: membership.user_id, from: membership.role, to: role },
    });
    revalidate(organizationId);
    return {
      status: "success",
      message: role === "owner" ? "Role updated to Owner." : "Role updated to Member.",
      data: undefined,
    };
  });
}

/** Deactivates an active membership or reactivates a deactivated one. */
export async function setMembershipStatusAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction<undefined>(async () => {
    await requirePlatformAdmin();
    const parsed = setMembershipStatusSchema.safeParse({
      organizationId: formData.get("organizationId"),
      membershipId: formData.get("membershipId"),
      action: formData.get("action"),
    });
    if (!parsed.success) {
      return errorState("Check the request", fieldErrorsFromIssues(parsed.error.issues));
    }
    const { organizationId, membershipId, action } = parsed.data;
    const service = createAdminSupabase();
    const membership = await loadMembership(service, membershipId, organizationId);
    if (!membership) return errorState(MISSING);

    if (action === "deactivate") {
      if (membership.status === "invited") {
        return errorState(
          "Pending invitations cannot be deactivated. Let the link expire, or resend it.",
        );
      }
      if (membership.status !== "active") {
        return errorState("This membership is already deactivated.");
      }
      if (
        membership.role === "owner" &&
        !(await hasAnotherActiveOwner(service, organizationId, membershipId))
      ) {
        return errorState(LAST_OWNER);
      }
    } else if (membership.status !== "disabled") {
      return errorState("Only deactivated memberships can be reactivated.");
    }

    const from: Enums<"membership_status"> = action === "deactivate" ? "active" : "disabled";
    const to: Enums<"membership_status"> = action === "deactivate" ? "disabled" : "active";
    const { data: updated, error } = await service
      .from("organization_memberships")
      .update({ status: to })
      .eq("id", membershipId)
      .eq("organization_id", organizationId)
      .eq("status", from)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`membership status update failed: ${error.message}`);
    if (!updated) return errorState(CHANGED_MEANWHILE);

    await recordAuditEvent(
      action === "deactivate" ? "membership.deactivated" : "membership.reactivated",
      {
        organizationId,
        targetType: "membership",
        targetId: membershipId,
        metadata: { user_id: membership.user_id, role: membership.role },
      },
    );
    revalidate(organizationId);
    return {
      status: "success",
      message:
        action === "deactivate"
          ? "Membership deactivated. The person no longer has access to this workspace."
          : "Membership reactivated.",
      data: undefined,
    };
  });
}
