import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { Button } from "@/components/ui/button";
import { AddToPipelineDialog } from "@/components/forms/add-to-pipeline-dialog";
import { CandidateCvCard } from "@/components/forms/candidate-cv-card";
import { CandidateGithubCard } from "@/components/forms/candidate-github-card";
import { PermissionDenied } from "@/components/permission-denied";
import { CandidateDetailView } from "@/components/views/candidate-detail";
import { createServerSupabase } from "@/lib/supabase/server";
import { removeApplicationAction } from "@/server/actions/applications";
import { deleteCandidateAction } from "@/server/actions/candidates";
import { getOrganizationContext } from "@/server/auth";
import { getCandidate, listCandidateApplications } from "@/server/data/candidates";
import { listJobOptions } from "@/server/data/jobs";

export const metadata: Metadata = { title: "Candidate" };

export default async function CandidateDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; candidateId: string }>;
}) {
  const { orgSlug, candidateId } = await params;
  const organization = await getOrganizationContext(orgSlug);
  if (!organization) return <PermissionDenied />;
  const candidate = await getCandidate(organization.id, candidateId);
  if (!candidate) notFound();

  const [applications, jobs] = await Promise.all([
    listCandidateApplications(organization.id, candidate.id),
    listJobOptions(organization.id),
  ]);
  const appliedJobIds = new Set(applications.map((application) => application.job.id));
  const jobOptions = jobs
    .filter((job) => job.status !== "closed" && !appliedJobIds.has(job.id))
    .map((job) => ({ id: job.id, label: job.title }));
  const base = `/o/${orgSlug}`;
  const returnTo = `${base}/candidates/${candidate.id}`;

  // Resolve who recorded each AI authorization for display (RLS-scoped; email only).
  const recorderIds = [
    candidate.cv_ai_authorized ? candidate.cv_ai_authorized_by : null,
    candidate.github_ai_authorized ? candidate.github_ai_authorized_by : null,
  ].filter((id): id is string => id !== null);
  const recorderEmails = new Map<string, string>();
  if (recorderIds.length > 0) {
    const supabase = await createServerSupabase();
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email")
      .in("id", recorderIds);
    for (const profile of profiles ?? []) recorderEmails.set(profile.id, profile.email);
  }
  const authorizedByEmail = candidate.cv_ai_authorized_by
    ? (recorderEmails.get(candidate.cv_ai_authorized_by) ?? null)
    : null;
  const githubAuthorizedByEmail = candidate.github_ai_authorized_by
    ? (recorderEmails.get(candidate.github_ai_authorized_by) ?? null)
    : null;

  const cv = candidate.cv_object_key
    ? {
        filename: candidate.cv_filename ?? "cv.pdf",
        sizeBytes: candidate.cv_size_bytes ?? 0,
        uploadedAt: candidate.cv_uploaded_at ?? candidate.created_at,
        source: candidate.cv_source ?? "candidate_provided_recruiter_upload",
      }
    : null;

  return (
    <CandidateDetailView
      base={base}
      candidate={candidate}
      applications={applications}
      cvSection={
        <CandidateCvCard
          base={base}
          orgSlug={orgSlug}
          candidateId={candidate.id}
          cv={cv}
          consent={{
            authorized: candidate.cv_ai_authorized,
            authorizedAt: candidate.cv_ai_authorized_at,
            authorizedByEmail,
            basis: candidate.cv_ai_authorization_basis,
          }}
        />
      }
      githubSection={
        <CandidateGithubCard
          orgSlug={orgSlug}
          candidateId={candidate.id}
          githubUrl={candidate.github_url}
          consent={{
            authorized: candidate.github_ai_authorized,
            authorizedAt: candidate.github_ai_authorized_at,
            authorizedByEmail: githubAuthorizedByEmail,
            basis: candidate.github_ai_authorization_basis,
          }}
        />
      }
      actions={
        <AddToPipelineDialog
          orgSlug={orgSlug}
          fixed={{ name: "candidateId", value: candidate.id }}
          choose={{
            name: "jobId",
            label: "Job",
            options: jobOptions,
            emptyText: "No open job left to add this candidate to.",
          }}
          triggerLabel="Add to job"
          title={`Add ${candidate.full_name} to a job`}
          description="The application starts in the New stage of that job's pipeline."
        />
      }
      renderApplicationLink={(application) => (
        <Button asChild variant="outline" size="sm">
          <Link href={`${base}/applications/${application.id}`}>
            <Sparkles aria-hidden="true" />
            Insights
          </Link>
        </Button>
      )}
      renderRemove={(application) => (
        <ConfirmActionDialog
          action={removeApplicationAction.bind(null, orgSlug, application.id)}
          triggerLabel="Remove"
          title={`Remove from ${application.job.title}?`}
          description="The candidate stays in the workspace; only this application is removed."
          confirmLabel="Remove"
        >
          <input type="hidden" name="returnTo" value={returnTo} />
        </ConfirmActionDialog>
      )}
      dangerZone={
        <ConfirmActionDialog
          action={deleteCandidateAction.bind(null, orgSlug, candidate.id)}
          triggerLabel="Delete candidate"
          title={`Delete ${candidate.full_name}?`}
          description="This removes the person record and every application. This cannot be undone."
          confirmLabel="Delete candidate"
        />
      }
    />
  );
}
