"use client";

import { useActionState } from "react";
import { OneTimeLink } from "@/components/one-time-link";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { idleState } from "@/lib/action-state";
import { inviteUserAction } from "@/server/actions/admin";
import { FormError, SubmitButton, TextField } from "./fields";

export function InviteUserForm({ organizationId }: { organizationId: string }) {
  const [state, action] = useActionState(inviteUserAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  if (state.status === "success") {
    return (
      <div className="space-y-4">
        <OneTimeLink
          url={state.data.inviteUrl}
          title={state.data.existingUser ? "Member added — sign-in link" : "Invitation link"}
        />
        <p className="text-sm text-muted-foreground">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="organizationId" value={organizationId} />
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
      <div className="space-y-1.5">
        <Label htmlFor="role">Role</Label>
        <Select name="role" defaultValue="member">
          <SelectTrigger id="role" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="member">Member</SelectItem>
            <SelectItem value="owner">Owner</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Owners and members have the same permissions in this version.
        </p>
      </div>
      <SubmitButton pendingLabel="Creating invitation…">Create invitation link</SubmitButton>
    </form>
  );
}
