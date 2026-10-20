"use client";

import { useActionState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { idleState } from "@/lib/action-state";
import { NO_JOB_OPTION } from "@/lib/validation/candidate";
import { createCandidateAction, updateCandidateAction } from "@/server/actions/candidates";
import { FormError, SubmitButton, TextAreaField, TextField } from "./fields";

export type CandidateFormValues = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  headline: string | null;
  location: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  notes: string | null;
};

type CandidateFormProps = {
  orgSlug: string;
  candidate?: CandidateFormValues;
  /** Create mode only: jobs the new candidate can be added to right away. */
  jobOptions?: Array<{ id: string; title: string }>;
  defaultJobId?: string;
};

export function CandidateForm({
  orgSlug,
  candidate,
  jobOptions = [],
  defaultJobId,
}: CandidateFormProps) {
  const action = useMemo(
    () =>
      candidate
        ? updateCandidateAction.bind(null, orgSlug, candidate.id)
        : createCandidateAction.bind(null, orgSlug),
    [orgSlug, candidate],
  );
  const [state, formAction] = useActionState(action, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  // On a failed submit, repopulate from the echoed values so typed data is not lost.
  const submitted = state.status === "error" ? state.values : undefined;
  const fieldValue = (name: string, fallback?: string | null) =>
    submitted?.[name] ?? fallback ?? "";

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormError message={state.status === "error" ? state.message : undefined} />
      <TextField
        name="fullName"
        label="Full name"
        required
        autoComplete="off"
        defaultValue={fieldValue("fullName", candidate?.full_name)}
        errors={fieldErrors?.fullName}
      />
      <TextField
        name="headline"
        label="Headline"
        placeholder="Senior backend engineer"
        defaultValue={fieldValue("headline", candidate?.headline)}
        errors={fieldErrors?.headline}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="email"
          label="Email"
          type="email"
          autoComplete="off"
          defaultValue={fieldValue("email", candidate?.email)}
          errors={fieldErrors?.email}
        />
        <TextField
          name="phone"
          label="Phone"
          type="tel"
          autoComplete="off"
          defaultValue={fieldValue("phone", candidate?.phone)}
          errors={fieldErrors?.phone}
        />
      </div>
      <TextField
        name="location"
        label="Location"
        defaultValue={fieldValue("location", candidate?.location)}
        errors={fieldErrors?.location}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="linkedinUrl"
          label="LinkedIn profile URL"
          type="url"
          inputMode="url"
          placeholder="https://www.linkedin.com/in/name"
          hint="Stored for manual review only; nothing is fetched from LinkedIn."
          defaultValue={fieldValue("linkedinUrl", candidate?.linkedin_url)}
          errors={fieldErrors?.linkedinUrl}
        />
        <TextField
          name="githubUrl"
          label="GitHub profile URL"
          type="url"
          inputMode="url"
          placeholder="https://github.com/username"
          defaultValue={fieldValue("githubUrl", candidate?.github_url)}
          errors={fieldErrors?.githubUrl}
        />
      </div>
      <TextAreaField
        name="notes"
        label="Notes"
        rows={5}
        defaultValue={fieldValue("notes", candidate?.notes)}
        hint="Internal notes. Keep to what is needed for the hiring decision."
        errors={fieldErrors?.notes}
      />
      {!candidate ? (
        <div className="space-y-1.5">
          <Label htmlFor="cv">CV (PDF, optional)</Label>
          <Input
            id="cv"
            name="cv"
            type="file"
            accept="application/pdf"
            className="text-sm"
            aria-invalid={fieldErrors?.cv ? true : undefined}
            aria-describedby={fieldErrors?.cv ? "cv-error" : "cv-hint"}
          />
          {fieldErrors?.cv ? (
            <p id="cv-error" className="text-sm text-destructive">
              {fieldErrors.cv.join(" ")}
            </p>
          ) : (
            <p id="cv-hint" className="text-xs text-muted-foreground">
              Candidate-provided PDF, max 10 MB. Uploading does not authorize AI analysis.
            </p>
          )}
        </div>
      ) : null}
      {!candidate ? (
        <div className="space-y-1.5">
          <Label htmlFor="jobId">Add to job</Label>
          <Select name="jobId" defaultValue={submitted?.jobId ?? defaultJobId ?? NO_JOB_OPTION}>
            <SelectTrigger id="jobId" className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_JOB_OPTION}>No job yet</SelectItem>
              {jobOptions.map((job) => (
                <SelectItem key={job.id} value={job.id}>
                  {job.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fieldErrors?.jobId ? (
            <p className="text-sm text-destructive">{fieldErrors.jobId.join(" ")}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Optional. The candidate starts in the New stage of that job&apos;s pipeline.
            </p>
          )}
        </div>
      ) : null}
      <SubmitButton pendingLabel="Saving…">
        {candidate ? "Save changes" : "Add candidate"}
      </SubmitButton>
    </form>
  );
}
