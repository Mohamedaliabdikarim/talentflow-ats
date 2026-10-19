import Link from "next/link";
import { LayoutGrid, Pencil } from "lucide-react";
import { FadeIn } from "@/components/motion/fade-in";
import { formatDateTime, PageHeader } from "@/components/page-header";
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
import type { Tables } from "@/lib/supabase/database.types";
import { JOB_STATUS_LABELS } from "@/lib/validation/job";
import type { JobApplicationRow } from "@/server/data/jobs";

type JobDetailViewProps = {
  base: string;
  job: Tables<"jobs">;
  applications: JobApplicationRow[];
  /** Mutating controls (add-candidate dialog); omitted in read-only contexts. */
  actions?: React.ReactNode;
  /** Delete control; omitted in read-only contexts. */
  dangerZone?: React.ReactNode;
};

export function JobDetailView({
  base,
  job,
  applications,
  actions,
  dangerZone,
}: JobDetailViewProps) {
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
            {actions}
          </>
        }
      />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <section className="min-w-0">
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
        <aside className="min-w-0 space-y-6">
          <section className="rounded-lg border bg-card p-5">
            <h2 className="text-sm font-semibold">Description</h2>
            {job.description ? (
              <p className="mt-2 text-sm whitespace-pre-wrap">{job.description}</p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No description yet.</p>
            )}
          </section>
          {dangerZone ? (
            <section className="rounded-lg border bg-card p-5">
              <h2 className="text-sm font-semibold">Danger zone</h2>
              <p className="mt-1 mb-3 text-sm text-muted-foreground">
                Deleting removes the job and its applications. Candidates are kept.
              </p>
              {dangerZone}
            </section>
          ) : null}
        </aside>
      </div>
    </FadeIn>
  );
}
