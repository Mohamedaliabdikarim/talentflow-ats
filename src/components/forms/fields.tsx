"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Form building blocks that implement the accessibility rules in docs/DESIGN.md §6:
 * visible labels, errors next to the field via aria-describedby, a focusable error
 * summary after a failed submit, and a pending state on the submit button.
 */

type BaseFieldProps = {
  name: string;
  label: string;
  hint?: string;
  errors?: string[];
  required?: boolean;
};

export function TextField({
  name,
  label,
  hint,
  errors,
  required,
  ...inputProps
}: BaseFieldProps & Omit<React.ComponentProps<typeof Input>, "name" | "id">) {
  const hasError = Boolean(errors?.length);
  const describedBy = [hint ? `${name}-hint` : null, hasError ? `${name}-error` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </Label>
      <Input
        id={name}
        name={name}
        required={required}
        aria-required={required}
        aria-invalid={hasError || undefined}
        aria-describedby={describedBy || undefined}
        {...inputProps}
      />
      {hint ? (
        <p id={`${name}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {hasError ? (
        <p id={`${name}-error`} className="text-sm text-destructive">
          {errors!.join(" ")}
        </p>
      ) : null}
    </div>
  );
}

export function TextAreaField({
  name,
  label,
  hint,
  errors,
  required,
  ...textareaProps
}: BaseFieldProps & Omit<React.ComponentProps<typeof Textarea>, "name" | "id">) {
  const hasError = Boolean(errors?.length);
  const describedBy = [hint ? `${name}-hint` : null, hasError ? `${name}-error` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </Label>
      <Textarea
        id={name}
        name={name}
        required={required}
        aria-invalid={hasError || undefined}
        aria-describedby={describedBy || undefined}
        {...textareaProps}
      />
      {hint ? (
        <p id={`${name}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {hasError ? (
        <p id={`${name}-error`} className="text-sm text-destructive">
          {errors!.join(" ")}
        </p>
      ) : null}
    </div>
  );
}

/** Error summary that receives focus when a submit fails (WCAG focus management). */
export function FormError({ message }: { message?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (message) ref.current?.focus();
  }, [message]);
  if (!message) return null;
  return (
    <Alert ref={ref} variant="destructive" role="alert" tabIndex={-1}>
      <AlertCircle aria-hidden="true" />
      <AlertTitle>Could not submit</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export function SubmitButton({
  children,
  pendingLabel = "Working…",
  ...props
}: React.ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
