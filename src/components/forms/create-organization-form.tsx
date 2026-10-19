"use client";

import { useActionState, useState } from "react";
import { idleState } from "@/lib/action-state";
import { slugify } from "@/lib/validation/organization";
import { createOrganizationAction } from "@/server/actions/admin";
import { FormError, SubmitButton, TextField } from "./fields";

export function CreateOrganizationForm() {
  const [state, action] = useActionState(createOrganizationAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError message={state.status === "error" ? state.message : undefined} />
      <TextField
        name="name"
        label="Organization name"
        required
        autoComplete="organization"
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          if (!slugTouched) setSlug(slugify(event.target.value));
        }}
        errors={fieldErrors?.name}
      />
      <TextField
        name="slug"
        label="Workspace slug"
        hint="Used in the workspace URL, for example /o/northwind-hiring. Lowercase letters, digits and hyphens."
        value={slug}
        onChange={(event) => {
          setSlugTouched(true);
          setSlug(event.target.value);
        }}
        errors={fieldErrors?.slug}
      />
      <SubmitButton pendingLabel="Creating…">Create organization</SubmitButton>
    </form>
  );
}
