"use client";

import { useActionState } from "react";
import { idleState } from "@/lib/action-state";
import { signInAction } from "@/server/actions/auth";
import { FormError, SubmitButton, TextField } from "./fields";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signInAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={action} className="space-y-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <FormError message={state.status === "error" ? state.message : undefined} />
      <TextField
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        errors={fieldErrors?.email}
      />
      <TextField
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        errors={fieldErrors?.password}
      />
      <SubmitButton className="w-full" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
