import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JobDetailView } from "@/components/views/job-detail";
import { PREVIEW_BASE } from "@/preview/enabled";
import { previewJob, previewJobApplications } from "@/preview/store";

export const metadata: Metadata = { title: "Job (preview)" };

export default async function PreviewJobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const job = previewJob(jobId);
  if (!job) notFound();
  return (
    <JobDetailView
      base={PREVIEW_BASE}
      job={job}
      applications={previewJobApplications(job.id)}
      actions={
        job.status === "closed" ? null : (
          <Button disabled title="Disabled in preview">
            <Plus aria-hidden="true" />
            Add candidate
          </Button>
        )
      }
      dangerZone={
        <Button variant="outline" className="text-destructive" disabled title="Disabled in preview">
          Delete job
        </Button>
      }
    />
  );
}
