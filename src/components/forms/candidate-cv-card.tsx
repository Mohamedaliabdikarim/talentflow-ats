"use client";

import { Download, FileText, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { idleState } from "@/lib/action-state";
import { formatDateTime } from "@/components/page-header";
import { SubmitButton } from "@/components/forms/fields";
import {
  authorizeCandidateCvAiAction,
  deleteCandidateCvAction,
  revokeCandidateCvAiAction,
  uploadCandidateCvAction,
} from "@/server/actions/candidate-cv";

export type CandidateCvState = {
  filename: string;
  sizeBytes: number;
  uploadedAt: string;
  source: string;
};

export type CandidateCvConsent = {
  authorized: boolean;
  authorizedAt: string | null;
  authorizedByEmail: string | null;
  basis: string | null;
};

type Props = {
  base: string;
  orgSlug: string;
  candidateId: string;
  cv: CandidateCvState | null;
  consent: CandidateCvConsent;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const SOURCE_LABEL: Record<string, string> = {
  candidate_provided_recruiter_upload: "Candidate-provided (recruiter upload)",
};

export function CandidateCvCard({ base, orgSlug, candidateId, cv, consent }: Props) {
  const [uploadState, upload] = useActionState(
    uploadCandidateCvAction.bind(null, orgSlug, candidateId),
    idleState,
  );
  const [deleteState, remove] = useActionState(
    deleteCandidateCvAction.bind(null, orgSlug, candidateId),
    idleState,
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const fileInputId = useId();

  return (
    <section
      className="space-y-3 rounded-lg border bg-card p-5"
      aria-labelledby={`${fileInputId}-h`}
    >
      <h2 id={`${fileInputId}-h`} className="text-sm font-semibold">
        CV
      </h2>

      {uploadState.status === "error" ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{uploadState.message}</AlertDescription>
        </Alert>
      ) : null}
      {uploadState.status === "success" ? (
        <p className="text-xs text-emerald-400" role="status">
          {uploadState.message}
        </p>
      ) : null}
      {deleteState.status === "error" ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{deleteState.message}</AlertDescription>
        </Alert>
      ) : null}

      {cv ? (
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-md border bg-background/40 p-3">
            <FileText aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 text-sm">
              <p className="truncate font-medium">{cv.filename}</p>
              <p className="text-xs text-muted-foreground">
                {formatBytes(cv.sizeBytes)} · PDF · uploaded {formatDateTime(cv.uploadedAt)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Source: {SOURCE_LABEL[cv.source] ?? cv.source}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`${base}/candidates/${candidateId}/cv`} target="_blank" rel="noreferrer">
                View
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`${base}/candidates/${candidateId}/cv?download=1`}>
                <Download aria-hidden />
                Download
              </Link>
            </Button>
          </div>

          <form action={upload} className="flex flex-wrap items-center gap-2 pt-1">
            <Label htmlFor={fileInputId} className="sr-only">
              Replace the CV with another PDF
            </Label>
            <Input
              id={fileInputId}
              type="file"
              name="cv"
              accept="application/pdf"
              required
              className="max-w-56 text-xs"
            />
            <SubmitButton variant="outline" size="sm" pendingLabel="Uploading…">
              <Upload aria-hidden />
              Replace
            </SubmitButton>
          </form>

          {confirmingDelete ? (
            <form action={remove} className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">Delete this CV?</p>
              <SubmitButton variant="destructive" size="sm" pendingLabel="Deleting…">
                Confirm delete
              </SubmitButton>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmingDelete(false)}
              >
                Cancel
              </Button>
            </form>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 aria-hidden />
              Delete CV
            </Button>
          )}

          <ConsentPanel
            orgSlug={orgSlug}
            candidateId={candidateId}
            consent={consent}
            labelId={`${fileInputId}-consent`}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            No CV uploaded yet. Add a candidate-provided PDF (max 10 MB).
          </p>
          <form action={upload} className="flex flex-wrap items-center gap-2">
            <Label htmlFor={fileInputId} className="sr-only">
              Upload a CV (PDF)
            </Label>
            <Input
              id={fileInputId}
              type="file"
              name="cv"
              accept="application/pdf"
              required
              className="max-w-56 text-xs"
            />
            <SubmitButton size="sm" pendingLabel="Uploading…">
              <Upload aria-hidden />
              Upload CV
            </SubmitButton>
          </form>
        </div>
      )}
    </section>
  );
}

function ConsentPanel({
  orgSlug,
  candidateId,
  consent,
  labelId,
}: {
  orgSlug: string;
  candidateId: string;
  consent: CandidateCvConsent;
  labelId: string;
}) {
  const [authState, authorize] = useActionState(
    authorizeCandidateCvAiAction.bind(null, orgSlug, candidateId),
    idleState,
  );
  const [, revoke] = useActionState(
    revokeCandidateCvAiAction.bind(null, orgSlug, candidateId),
    idleState,
  );
  const basisId = useId();
  const confirmId = useId();
  const fieldErrors = authState.status === "error" ? authState.fieldErrors : undefined;

  return (
    <div className="mt-2 space-y-3 border-t pt-4" aria-labelledby={labelId}>
      <div>
        <h3 id={labelId} className="text-sm font-semibold">
          AI analysis authorization
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Uploading a CV does not permit AI analysis. AI may only use information the candidate
          supplied and authorized for that purpose. Record authorization explicitly; it can be
          revoked at any time.
        </p>
      </div>

      {consent.authorized ? (
        <div className="space-y-2">
          <p className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-400">
            Authorized
          </p>
          <dl className="space-y-1 text-xs text-muted-foreground">
            <div>
              <dt className="inline font-medium">Recorded: </dt>
              <dd className="inline">
                {consent.authorizedAt ? formatDateTime(consent.authorizedAt) : "—"}
                {consent.authorizedByEmail ? ` by ${consent.authorizedByEmail}` : ""}
              </dd>
            </div>
            {consent.basis ? (
              <div>
                <dt className="inline font-medium">Basis: </dt>
                <dd className="inline break-words">{consent.basis}</dd>
              </div>
            ) : null}
          </dl>
          <form action={revoke}>
            <SubmitButton variant="outline" size="sm" pendingLabel="Revoking…">
              Revoke authorization
            </SubmitButton>
          </form>
        </div>
      ) : (
        <form action={authorize} className="space-y-3">
          {authState.status === "error" ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{authState.message}</AlertDescription>
            </Alert>
          ) : null}
          <p className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
            Not authorized
          </p>
          <div className="space-y-1.5">
            <Label htmlFor={basisId}>Stated basis</Label>
            <Textarea
              id={basisId}
              name="basis"
              rows={2}
              required
              placeholder="e.g. candidate emailed their CV and agreed in writing to AI screening"
              aria-invalid={fieldErrors?.basis ? true : undefined}
              aria-describedby={fieldErrors?.basis ? `${basisId}-error` : undefined}
            />
            {fieldErrors?.basis ? (
              <p id={`${basisId}-error`} className="text-xs text-destructive">
                {fieldErrors.basis.join(" ")}
              </p>
            ) : null}
          </div>
          <div className="flex items-start gap-2">
            <input
              id={confirmId}
              name="confirm"
              type="checkbox"
              value="yes"
              className="mt-0.5 size-4 rounded border-input"
              aria-describedby={fieldErrors?.confirm ? `${confirmId}-error` : undefined}
            />
            <Label htmlFor={confirmId} className="text-xs leading-snug font-normal">
              The candidate supplied this CV and authorized its use for AI analysis.
            </Label>
          </div>
          {fieldErrors?.confirm ? (
            <p id={`${confirmId}-error`} className="text-xs text-destructive">
              {fieldErrors.confirm.join(" ")}
            </p>
          ) : null}
          <SubmitButton size="sm" pendingLabel="Recording…">
            Record authorization
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
