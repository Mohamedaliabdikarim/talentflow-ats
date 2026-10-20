"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { idleState } from "@/lib/action-state";
import type { Enums } from "@/lib/supabase/database.types";
import {
  changeMembershipRoleAction,
  setMembershipStatusAction,
} from "@/server/actions/memberships";
import { SubmitButton } from "./fields";

/**
 * Per-member controls for the platform-admin organization page (ADR-040): change role for an
 * active member, deactivate with an inline confirmation, reactivate a deactivated member. A
 * pending invitation shows no controls here (the Invitation column handles resending). Errors
 * such as "last active owner" are returned by the Server Action and shown next to the row.
 */
export function MembershipControls({
  organizationId,
  membershipId,
  role,
  status,
}: {
  organizationId: string;
  membershipId: string;
  role: Enums<"membership_role">;
  status: Enums<"membership_status">;
}) {
  const [roleState, changeRole] = useActionState(changeMembershipRoleAction, idleState);
  const [statusState, setStatus] = useActionState(setMembershipStatusAction, idleState);
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);

  if (status === "invited") {
    return <span className="text-xs text-muted-foreground">Pending invitation</span>;
  }

  const message =
    roleState.status === "error"
      ? roleState.message
      : statusState.status === "error"
        ? statusState.message
        : null;
  const notice =
    roleState.status === "success"
      ? roleState.message
      : statusState.status === "success"
        ? statusState.message
        : null;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {status === "active" ? (
          <>
            <form action={changeRole}>
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="membershipId" value={membershipId} />
              <input type="hidden" name="role" value={role === "owner" ? "member" : "owner"} />
              <SubmitButton variant="outline" size="sm" pendingLabel="Updating…">
                {role === "owner" ? "Make member" : "Make owner"}
              </SubmitButton>
            </form>
            {confirmingDeactivate ? (
              <form action={setStatus} className="flex items-center gap-2">
                <input type="hidden" name="organizationId" value={organizationId} />
                <input type="hidden" name="membershipId" value={membershipId} />
                <input type="hidden" name="action" value="deactivate" />
                <SubmitButton variant="destructive" size="sm" pendingLabel="Deactivating…">
                  Confirm deactivate
                </SubmitButton>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmingDeactivate(false)}
                >
                  Cancel
                </Button>
              </form>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => setConfirmingDeactivate(true)}
              >
                Deactivate
              </Button>
            )}
          </>
        ) : (
          <form action={setStatus}>
            <input type="hidden" name="organizationId" value={organizationId} />
            <input type="hidden" name="membershipId" value={membershipId} />
            <input type="hidden" name="action" value="reactivate" />
            <SubmitButton variant="outline" size="sm" pendingLabel="Reactivating…">
              Reactivate
            </SubmitButton>
          </form>
        )}
      </div>
      {message ? (
        <p className="text-xs text-destructive" role="alert">
          {message}
        </p>
      ) : null}
      {notice ? (
        <p className="text-xs text-emerald-400" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
