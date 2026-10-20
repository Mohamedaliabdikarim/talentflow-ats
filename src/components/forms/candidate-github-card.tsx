"use client";

import { useActionState, useId } from "react";
import { ExternalLink } from "@/components/external-link";
import { SubmitButton } from "@/components/forms/fields";
import { formatDateTime } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { idleState } from "@/lib/action-state";
import {
  authorizeCandidateGithubAiAction,
  revokeCandidateGithubAiAction,
} from "@/server/actions/candidate-github";

/**
 * GitHub evidence card (ADR-038): the profile link for manual review, and a separate, explicit
 * AI-use authorization for that exact profile. The confirmation is never pre-checked; the
 * authorization is revocable and is reset automatically when the URL changes.
 */

export type CandidateGithubConsent = {
  authorized: boolean;
  authorizedAt: string | null;
  authorizedByEmail: string | null;
  basis: string | null;
};

type Props = {
  orgSlug: string;
  candidateId: string;
  githubUrl: string | null;
  consent: CandidateGithubConsent;
};

export function CandidateGithubCard({ orgSlug, candidateId, githubUrl, consent }: Props) {
  const [authState, authorize] = useActionState(
    authorizeCandidateGithubAiAction.bind(null, orgSlug, candidateId),
    idleState,
  );
  const [revokeState, revoke] = useActionState(
    revokeCandidateGithubAiAction.bind(null, orgSlug, candidateId),
    idleState,
  );
  const headingId = useId();
  const basisId = useId();
  const confirmId = useId();
  const fieldErrors = authState.status === "error" ? authState.fieldErrors : undefined;

  return (
    <section className="space-y-3 rounded-lg border bg-card p-5" aria-labelledby={headingId}>
      <h2 id={headingId} className="text-sm font-semibold">
        GitHub evidence
      </h2>

      {!githubUrl ? (
        <p className="text-sm text-muted-foreground">
          No GitHub profile URL on file. Add one on the Edit page to allow public repositories as
          evidence. Only the exact profile the candidate provides is ever used.
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm">
            <ExternalLink href={githubUrl}>Profile provided</ExternalLink>
            <span className="text-muted-foreground"> · public data only, manual review</span>
          </p>

          {revokeState.status === "error" ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{revokeState.message}</AlertDescription>
            </Alert>
          ) : null}
          {revokeState.status === "success" && !consent.authorized ? (
            <p className="text-xs text-emerald-400" role="status">
              {revokeState.message}
            </p>
          ) : null}
          {authState.status === "success" && consent.authorized ? (
            <p className="text-xs text-emerald-400" role="status">
              {authState.message}
            </p>
          ) : null}

          <div className="space-y-3 border-t pt-4">
            <div>
              <h3 className="text-sm font-semibold">AI analysis authorization</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Providing a profile link does not permit AI analysis. With authorization, Candidate
                Insights may read this account&apos;s public repositories, languages and READMEs
                through the official GitHub API and attribute evidence to them. Changing the URL
                resets this authorization; it can be revoked at any time.
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
                    placeholder="e.g. candidate listed this profile in their application and agreed to AI screening"
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
                    The candidate provided this GitHub profile and authorized the use of its public
                    repositories for AI analysis.
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
        </div>
      )}
    </section>
  );
}
