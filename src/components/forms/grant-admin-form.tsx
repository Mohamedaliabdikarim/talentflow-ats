"use client";

import { useActionState } from "react";
import { OneTimeLink } from "@/components/one-time-link";
import { idleState } from "@/lib/action-state";
import { grantPlatformAdminAction } from "@/server/actions/admin";
import { FormError, SubmitButton, TextField } from "./fields";

export function GrantAdminForm() {
  const [state, action] = useActionState(grantPlatformAdminAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  if (state.status === "success") {
    return (
      <div className="space-y-4">
        {state.data ? (
          <OneTimeLink url={state.data.inviteUrl} title="Admin invitation link" />
        ) : null}
        <p className="text-sm text-muted-foreground">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError message={state.status === "error" ? state.message : undefined} />
      <TextField
        name="email"
        label="Email"
        type="email"
        autoComplete="off"
        required
        errors={fieldErrors?.email}
      />
      <TextField
        name="fullName"
        label="Full name"
        autoComplete="off"
        errors={fieldErrors?.fullName}
      />
      <TextField
        name="note"
        label="Note"
        hint="Why this person needs platform-wide access. Stored in the admin record."
        errors={fieldErrors?.note}
      />
      <SubmitButton pendingLabel="Granting…">Grant platform admin</SubmitButton>
    </form>
  );
}
