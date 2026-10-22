import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { AddToPipelineDialog } from "@/components/forms/add-to-pipeline-dialog";
import { PermissionDenied } from "@/components/permission-denied";
import { JobDetailView } from "@/components/views/job-detail";
import { isUuid } from "@/lib/validation/id";
import { deleteJobAction } from "@/server/actions/jobs";
import { getOrganizationContext } from "@/server/auth";
import { listCandidateOptions } from "@/server/data/candidates";
import { getJob, listJobApplications } from "@/server/data/jobs";

type Params = Promise<{ orgSlug: string; jobId: string }>;

/** One job read per request, shared by the page title and the page body. */
const loadJob = cache(getJob);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { orgSlug, jobId } = await params;
  const organization = await getOrganizationContext(orgSlug);
  const job = organization && isUuid(jobId) ? await loadJob(organization.id, jobId) : null;
  return { title: job?.title ?? "Job" };
}

export default async function JobDetailPage({ params }: { params: Params }) {
  const { orgSlug, jobId } = await params;
  const organization = await getOrganizationContext(orgSlug);
  if (!organization) return <PermissionDenied />;
  if (!isUuid(jobId)) notFound();
  const job = await loadJob(organization.id, jobId);
  if (!job) notFound();

  const [applications, candidates] = await Promise.all([
    listJobApplications(organization.id, job.id),
    listCandidateOptions(organization.id),
  ]);
  const applied = new Set(applications.map((application) => application.candidate.id));
  const candidateOptions = candidates
    .filter((candidate) => !applied.has(candidate.id))
    .map((candidate) => ({ id: candidate.id, label: candidate.full_name }));

  return (
    <JobDetailView
      base={`/o/${orgSlug}`}
      job={job}
      applications={applications}
      actions={
        job.status === "closed" ? null : (
          <AddToPipelineDialog
            orgSlug={orgSlug}
            fixed={{ name: "jobId", value: job.id }}
            choose={{
              name: "candidateId",
              label: "Candidate",
              options: candidateOptions,
              emptyText:
                "Every candidate in this workspace is already in this pipeline, or there are no candidates yet.",
              emptyAction: {
                href: `/o/${orgSlug}/candidates/new?job=${job.id}`,
                label: "Create new candidate",
              },
            }}
            triggerLabel="Add candidate"
            title={`Add a candidate to ${job.title}`}
            description="The candidate starts in the New stage."
          />
        )
      }
      dangerZone={
        <ConfirmActionDialog
          action={deleteJobAction.bind(null, orgSlug, job.id)}
          triggerLabel="Delete job"
          title={`Delete ${job.title}?`}
          description="This removes the job and every application in its pipeline. This cannot be undone."
          confirmLabel="Delete job"
        />
      }
    />
  );
}
