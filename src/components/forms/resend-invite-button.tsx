"use client";

import { useActionState } from "react";
import { OneTimeLink } from "@/components/one-time-link";
import { idleState } from "@/lib/action-state";
import { reissueInvitationAction } from "@/server/actions/admin";
import { SubmitButton } from "./fields";

/**
 * Resends the one-time invitation link for a pending membership (ADR-031). Shown only for
 * members whose status is "invited"; a platform admin uses it when the original link has
 * expired or was lost. The fresh link is displayed once and never persisted or logged.
 */
export function ResendInviteButton({ membershipId }: { membershipId: string }) {
  const [state, action] = useActionState(reissueInvitationAction, idleState);

  if (state.status === "success") {
    return <OneTimeLink url={state.data.inviteUrl} title="New invitation link" />;
  }

  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="membershipId" value={membershipId} />
      {state.status === "error" ? (
        <p className="text-xs text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
      <SubmitButton variant="outline" size="sm" pendingLabel="Creating…">
        Resend invite
      </SubmitButton>
    </form>
  );
}
