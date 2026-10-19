import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JobForm } from "@/components/forms/job-form";
import { FadeIn } from "@/components/motion/fade-in";
import { PageHeader } from "@/components/page-header";
import { PREVIEW_ORG_SLUG } from "@/preview/enabled";
import { previewJob } from "@/preview/store";

export const metadata: Metadata = { title: "Edit job (preview)" };

export default async function PreviewEditJobPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const job = previewJob(jobId);
  if (!job) notFound();
  return (
    <FadeIn className="max-w-2xl">
      <PageHeader
        title="Edit job"
        description={`${job.title} · controls are disabled in the preview.`}
      />
      <fieldset disabled className="m-0 rounded-lg border bg-card p-6">
        <JobForm orgSlug={PREVIEW_ORG_SLUG} job={job} />
      </fieldset>
    </FadeIn>
  );
}
