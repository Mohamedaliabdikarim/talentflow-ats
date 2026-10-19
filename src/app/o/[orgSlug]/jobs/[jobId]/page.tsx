import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LayoutGrid, Pencil } from "lucide-react";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { AddToPipelineDialog } from "@/components/forms/add-to-pipeline-dialog";
import { FadeIn } from "@/components/motion/fade-in";
import { formatDateTime, PageHeader } from "@/components/page-header";
import { PermissionDenied } from "@/components/permission-denied";
import { StageBadge } from "@/components/stage-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { JOB_STATUS_LABELS } from "@/lib/validation/job";
import { deleteJobAction } from "@/server/actions/jobs";
import { getOrganizationContext } from "@/server/auth";
import { listCandidateOptions } from "@/server/data/candidates";
import { getJob, listJobApplications } from "@/server/data/jobs";

export const metadata: Metadata = { title: "Job" };

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; jobId: string }>;
}) {
  const { orgSlug, jobId } = await params;
  const organization = await getOrganizationContext(orgSlug);
  if (!organization) return <PermissionDenied />;
  const job = await getJob(organization.id, jobId);
  if (!job) notFound();

  const [applications, candidates] = await Promise.all([
    listJobApplications(organization.id, job.id),
    listCandidateOptions(organization.id),
  ]);
  const applied = new Set(applications.map((application) => application.candidate.id));
  const candidateOptions = candidates
    .filter((candidate) => !applied.has(candidate.id))
    .map((candidate) => ({ id: candidate.id, label: candidate.full_name }));
  const base = `/o/${orgSlug}`;

  return (
    <FadeIn>
      <PageHeader
        title={job.title}
        description={[
          job.location,
          job.employment_type,
          `updated ${formatDateTime(job.updated_at)}`,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`${base}/pipeline?job=${job.id}`}>
                <LayoutGrid aria-hidden="true" />
                Pipeline
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`${base}/jobs/${job.id}/edit`}>
                <Pencil aria-hidden="true" />
                Edit
              </Link>
            </Button>
            {job.status === "closed" ? null : (
              <AddToPipelineDialog
                orgSlug={orgSlug}
                fixed={{ name: "jobId", value: job.id }}
                choose={{
                  name: "candidateId",
                  label: "Candidate",
                  options: candidateOptions,
                  emptyText:
                    "Every candidate in this workspace is already in this pipeline, or there are no candidates yet.",
                }}
                triggerLabel="Add candidate"
                title={`Add a candidate to ${job.title}`}
                description="The candidate starts in the New stage."
              />
            )}
          </>
        }
      />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <section>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-lg font-semibold">Applications</h2>
            <Badge variant={job.status === "open" ? "secondary" : "outline"}>
              {JOB_STATUS_LABELS[job.status]}
            </Badge>
          </div>
          {applications.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              No candidates in this pipeline yet. Use &quot;Add candidate&quot; or{" "}
              <Link
                href={`${base}/candidates/new?job=${job.id}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                create a new candidate for this job
              </Link>
              .
            </p>
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Stage since</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {applications.map((application) => (
                    <TableRow key={application.id}>
                      <TableCell>
                        <Link
                          href={`${base}/candidates/${application.candidate.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {application.candidate.full_name}
                        </Link>
                        {application.candidate.headline ? (
                          <p className="text-xs text-muted-foreground">
                            {application.candidate.headline}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <StageBadge stage={application.stage} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(application.stage_changed_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
        <aside className="space-y-6">
          <section className="rounded-lg border bg-card p-5">
            <h2 className="text-sm font-semibold">Description</h2>
            {job.description ? (
              <p className="mt-2 text-sm whitespace-pre-wrap">{job.description}</p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No description yet.</p>
            )}
          </section>
          <section className="rounded-lg border bg-card p-5">
            <h2 className="text-sm font-semibold">Danger zone</h2>
            <p className="mt-1 mb-3 text-sm text-muted-foreground">
              Deleting removes the job and its applications. Candidates are kept.
            </p>
            <ConfirmActionDialog
              action={deleteJobAction.bind(null, orgSlug, job.id)}
              triggerLabel="Delete job"
              title={`Delete ${job.title}?`}
              description="This removes the job and every application in its pipeline. This cannot be undone."
              confirmLabel="Delete job"
            />
          </section>
        </aside>
      </div>
    </FadeIn>
  );
}
