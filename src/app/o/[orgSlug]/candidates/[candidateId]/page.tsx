import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { ExternalLink } from "@/components/external-link";
import { AddToPipelineDialog } from "@/components/forms/add-to-pipeline-dialog";
import { FadeIn } from "@/components/motion/fade-in";
import { formatDateTime, PageHeader } from "@/components/page-header";
import { PermissionDenied } from "@/components/permission-denied";
import { StageBadge } from "@/components/stage-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

  const facts: Array<[string, React.ReactNode]> = [
    ["Email", candidate.email ?? "—"],
    ["Phone", candidate.phone ?? "—"],
    ["Location", candidate.location ?? "—"],
    [
      "LinkedIn",
      candidate.linkedin_url ? (
        <ExternalLink href={candidate.linkedin_url}>Profile provided — manual review</ExternalLink>
      ) : (
        "—"
      ),
    ],
    [
      "GitHub",
      candidate.github_url ? (
        <ExternalLink href={candidate.github_url}>{candidate.github_url}</ExternalLink>
      ) : (
        "—"
      ),
    ],
    ["Added", formatDateTime(candidate.created_at)],
  ];

  return (
    <FadeIn>
      <PageHeader
        title={candidate.full_name}
        description={candidate.headline ?? undefined}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`${base}/candidates/${candidate.id}/edit`}>
                <Pencil aria-hidden="true" />
                Edit
              </Link>
            </Button>
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
          </>
        }
      />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-lg font-semibold">Applications</h2>
            {applications.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                Not in any pipeline yet. Use &quot;Add to job&quot; to start one.
              </p>
            ) : (
              <div className="rounded-lg border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead>Stage since</TableHead>
                      <TableHead className="w-0" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {applications.map((application) => (
                      <TableRow key={application.id}>
                        <TableCell>
                          <Link
                            href={`${base}/jobs/${application.job.id}`}
                            className="font-medium underline-offset-4 hover:underline"
                          >
                            {application.job.title}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <StageBadge stage={application.stage} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDateTime(application.stage_changed_at)}
                        </TableCell>
                        <TableCell>
                          <ConfirmActionDialog
                            action={removeApplicationAction.bind(null, orgSlug, application.id)}
                            triggerLabel="Remove"
                            title={`Remove from ${application.job.title}?`}
                            description="The candidate stays in the workspace; only this application is removed."
                            confirmLabel="Remove"
                          >
                            <input type="hidden" name="returnTo" value={returnTo} />
                          </ConfirmActionDialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
          <section>
            <h2 className="mb-3 text-lg font-semibold">Notes</h2>
            {candidate.notes ? (
              <p className="rounded-lg border bg-card p-5 text-sm whitespace-pre-wrap">
                {candidate.notes}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">No notes.</p>
            )}
          </section>
        </div>
        <aside className="space-y-6">
          <section className="rounded-lg border bg-card p-5">
            <h2 className="text-sm font-semibold">Profile</h2>
            <dl className="mt-3 space-y-3 text-sm">
              {facts.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="break-words">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="rounded-lg border bg-card p-5">
            <h2 className="text-sm font-semibold">Danger zone</h2>
            <p className="mt-1 mb-3 text-sm text-muted-foreground">
              Deleting removes the candidate, their applications and any insights.
            </p>
            <ConfirmActionDialog
              action={deleteCandidateAction.bind(null, orgSlug, candidate.id)}
              triggerLabel="Delete candidate"
              title={`Delete ${candidate.full_name}?`}
              description="This removes the person record and every application. This cannot be undone."
              confirmLabel="Delete candidate"
            />
          </section>
        </aside>
      </div>
    </FadeIn>
  );
}
