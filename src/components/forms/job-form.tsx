"use client";

import { useActionState, useMemo } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { idleState } from "@/lib/action-state";
import { JOB_STATUS_LABELS, JOB_STATUSES, type JobStatus } from "@/lib/validation/job";
import { createJobAction, updateJobAction } from "@/server/actions/jobs";
import { FormError, SubmitButton, TextAreaField, TextField } from "./fields";

type JobFormProps = {
  orgSlug: string;
  job?: {
    id: string;
    title: string;
    description: string;
    location: string | null;
    employment_type: string | null;
    status: JobStatus;
  };
};

export function JobForm({ orgSlug, job }: JobFormProps) {
  const action = useMemo(
    () => (job ? updateJobAction.bind(null, orgSlug, job.id) : createJobAction.bind(null, orgSlug)),
    [orgSlug, job],
  );
  const [state, formAction] = useActionState(action, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormError message={state.status === "error" ? state.message : undefined} />
      <TextField
        name="title"
        label="Job title"
        required
        defaultValue={job?.title ?? ""}
        errors={fieldErrors?.title}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="location"
          label="Location"
          defaultValue={job?.location ?? ""}
          placeholder="Oslo · Remote"
          errors={fieldErrors?.location}
        />
        <TextField
          name="employmentType"
          label="Employment type"
          defaultValue={job?.employment_type ?? ""}
          placeholder="Full-time"
          errors={fieldErrors?.employmentType}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="status">Status</Label>
        <Select name="status" defaultValue={job?.status ?? "open"}>
          <SelectTrigger id="status" className="w-full sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {JOB_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {JOB_STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Closed jobs stay visible with their applications but cannot receive new candidates.
        </p>
      </div>
      <TextAreaField
        name="description"
        label="Description"
        rows={8}
        defaultValue={job?.description ?? ""}
        hint="Responsibilities, requirements and anything a recruiter needs when screening."
        errors={fieldErrors?.description}
      />
      <SubmitButton pendingLabel="Saving…">{job ? "Save changes" : "Post job"}</SubmitButton>
    </form>
  );
}
