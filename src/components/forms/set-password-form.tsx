"use client";

import { useActionState } from "react";
import { idleState } from "@/lib/action-state";
import { setPasswordAction } from "@/server/actions/auth";
import { FormError, SubmitButton, TextField } from "./fields";

export function SetPasswordForm() {
  const [state, action] = useActionState(setPasswordAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError message={state.status === "error" ? state.message : undefined} />
      <TextField
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        hint="At least 10 characters. A password manager is welcome."
        required
        errors={fieldErrors?.password}
      />
      <TextField
        name="confirmPassword"
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        required
        errors={fieldErrors?.confirmPassword}
      />
      <SubmitButton className="w-full" pendingLabel="Saving…">
        Save password and continue
      </SubmitButton>
    </form>
  );
}
