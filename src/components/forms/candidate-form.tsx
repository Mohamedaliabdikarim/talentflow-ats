"use client";

import { LoaderCircle, Sparkles } from "lucide-react";
import { useActionState, useId, useMemo, useRef, useState, useTransition } from "react";
import type { ActionState } from "@/lib/action-state";
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
import {
  type CandidatePrefill,
  EXTRACTED_FIELD_LABELS,
  EXTRACTED_FIELDS,
  type ExtractedField,
} from "@/lib/ai/candidate-extract-contract";
import { NO_JOB_OPTION } from "@/lib/validation/candidate";
import { extractCandidateDetailsAction } from "@/server/actions/candidate-extract";
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

/** Contract of the extraction action (real or preview). `null` disables extraction entirely. */
export type ExtractAction = (
  orgSlug: string,
  formData: FormData,
) => Promise<ActionState<CandidatePrefill>>;

type CandidateFormProps = {
  orgSlug: string;
  candidate?: CandidateFormValues;
  /** Create mode only: jobs the new candidate can be added to right away. */
  jobOptions?: Array<{ id: string; title: string }>;
  defaultJobId?: string;
  /** Create mode only. Defaults to the real Server Action; the preview passes null. */
  extractAction?: ExtractAction | null;
};

type ExtractionStatus =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; filled: ExtractedField[]; warnings: string[]; message: string }
  | { kind: "failed"; message: string };

/**
 * Candidate create/edit form. In create mode the CV is optional (ADR-033); when a PDF is chosen,
 * its details are extracted automatically and used to prefill fields the recruiter has not typed
 * into (ADR-039). The recruiter reviews everything before saving; nothing from the extraction is
 * stored on its own, and choosing a CV never records AI-use authorization.
 */
export function CandidateForm({
  orgSlug,
  candidate,
  jobOptions = [],
  defaultJobId,
  extractAction = extractCandidateDetailsAction,
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

  // Extraction prefill: the merged defaults (typed values kept, empty fields filled) are applied
  // by remounting the text fields with a new key; the file input and the job select stay mounted.
  const formRef = useRef<HTMLFormElement>(null);
  const [prefill, setPrefill] = useState<Partial<Record<string, string>> | null>(null);
  const [fieldsKey, setFieldsKey] = useState(0);
  const [extraction, setExtraction] = useState<ExtractionStatus>({ kind: "idle" });
  const [isExtracting, startExtraction] = useTransition();
  const extractionNoteId = useId();

  const fieldValue = (name: string, fallback?: string | null) =>
    submitted?.[name] ?? prefill?.[name] ?? fallback ?? "";

  const onCvChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !extractAction || candidate) {
      setExtraction({ kind: "idle" });
      return;
    }
    const formData = new FormData();
    formData.set("cv", file);
    setExtraction({ kind: "running" });
    startExtraction(async () => {
      const result = await extractAction(orgSlug, formData);
      if (result.status !== "success") {
        setExtraction({
          kind: "failed",
          message:
            result.status === "error" ? result.message : "Could not extract details from the CV.",
        });
        return;
      }
      // Keep whatever the recruiter already typed; fill only empty fields.
      const current = formRef.current ? new FormData(formRef.current) : null;
      const merged: Partial<Record<string, string>> = {};
      const filled: ExtractedField[] = [];
      for (const name of [...EXTRACTED_FIELDS, "notes"] as const) {
        const typed = current?.get(name);
        const typedText = typeof typed === "string" ? typed : "";
        if (typedText.trim().length > 0) {
          merged[name] = typedText;
          continue;
        }
        const extracted = name === "notes" ? undefined : result.data.values[name as ExtractedField];
        if (extracted) {
          merged[name] = extracted;
          filled.push(name as ExtractedField);
        }
      }
      setPrefill(merged);
      setFieldsKey((key) => key + 1);
      setExtraction({
        kind: "done",
        filled,
        warnings: result.data.warnings,
        message: result.message ?? "Details extracted from the CV.",
      });
    });
  };

  const extracting = isExtracting || extraction.kind === "running";

  return (
    <form ref={formRef} action={formAction} className="space-y-4" noValidate>
      <FormError message={state.status === "error" ? state.message : undefined} />

      {!candidate ? (
        <div className="space-y-1.5">
          <Label htmlFor="cv">CV (PDF, optional)</Label>
          <Input
            id="cv"
            name="cv"
            type="file"
            accept="application/pdf"
            className="text-sm"
            onChange={onCvChange}
            disabled={extracting}
            aria-invalid={fieldErrors?.cv ? true : undefined}
            aria-describedby={[
              fieldErrors?.cv ? "cv-error" : "cv-hint",
              extraction.kind !== "idle" ? extractionNoteId : null,
            ]
              .filter(Boolean)
              .join(" ")}
          />
          {fieldErrors?.cv ? (
            <p id="cv-error" className="text-sm text-destructive">
              {fieldErrors.cv.join(" ")}
            </p>
          ) : (
            <p id="cv-hint" className="text-xs text-muted-foreground">
              Candidate-provided PDF, max 10 MB. You can add a candidate without a CV.
              {extractAction
                ? " When you choose a PDF, its contact details are read automatically to prefill the form; you review and correct them before saving."
                : ""}{" "}
              Uploading does not authorize AI analysis of the CV.
            </p>
          )}
          {extraction.kind !== "idle" ? (
            <div
              id={extractionNoteId}
              role="status"
              aria-live="polite"
              className="rounded-md border border-dashed px-3 py-2 text-xs"
            >
              {extraction.kind === "running" ? (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                  Reading the CV to prefill the form…
                </p>
              ) : extraction.kind === "failed" ? (
                <p className="text-muted-foreground">
                  {extraction.message} You can still enter the details manually and save with the
                  CV.
                </p>
              ) : (
                <div className="space-y-1">
                  <p className="flex items-center gap-2 font-medium">
                    <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
                    {extraction.message}
                  </p>
                  {extraction.filled.length > 0 ? (
                    <p className="text-muted-foreground">
                      Prefilled from the CV:{" "}
                      {extraction.filled.map((field) => EXTRACTED_FIELD_LABELS[field]).join(", ")}.
                      Fields you had already filled in were left unchanged.
                    </p>
                  ) : null}
                  {extraction.warnings.map((warning) => (
                    <p key={warning} className="text-muted-foreground">
                      {warning}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      <div key={fieldsKey} className="space-y-4">
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
            hint="GitHub evidence for Candidate Insights needs a separate authorization on the candidate page."
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
      </div>

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
      <SubmitButton pendingLabel="Saving…" disabled={extracting}>
        {candidate ? "Save changes" : "Add candidate"}
      </SubmitButton>
    </form>
  );
}
