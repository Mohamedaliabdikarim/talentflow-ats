import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { FadeIn } from "@/components/motion/fade-in";
import { EmptyState, formatDateTime, PageHeader } from "@/components/page-header";
import { PermissionDenied } from "@/components/permission-denied";
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
import { getOrganizationContext } from "@/server/auth";
import { listJobs } from "@/server/data/jobs";

export const metadata: Metadata = { title: "Jobs" };

export default async function JobsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const organization = await getOrganizationContext(orgSlug);
  if (!organization) return <PermissionDenied />;
  const jobs = await listJobs(organization.id);
  const base = `/o/${orgSlug}`;

  return (
    <FadeIn>
      <PageHeader
        title="Jobs"
        description="Open positions and their pipelines."
        actions={
          <Button asChild>
            <Link href={`${base}/jobs/new`}>
              <Plus aria-hidden="true" />
              Post job
            </Link>
          </Button>
        }
      />
      {jobs.length === 0 ? (
        <EmptyState
          title="No jobs yet"
          description="Post the first job to start adding candidates to its pipeline."
          action={
            <Button asChild>
              <Link href={`${base}/jobs/new`}>Post job</Link>
            </Button>
          }
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Applications</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`${base}/jobs/${job.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {job.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={job.status === "open" ? "secondary" : "outline"}>
                      {JOB_STATUS_LABELS[job.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{job.location ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Link
                      href={`${base}/pipeline?job=${job.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {job.application_count}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(job.updated_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </FadeIn>
  );
}
