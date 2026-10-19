import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JobForm } from "@/components/forms/job-form";
import { FadeIn } from "@/components/motion/fade-in";
import { PageHeader } from "@/components/page-header";
import { PermissionDenied } from "@/components/permission-denied";
import { getOrganizationContext } from "@/server/auth";
import { getJob } from "@/server/data/jobs";

export const metadata: Metadata = { title: "Edit job" };

export default async function EditJobPage({
  params,
}: {
  params: Promise<{ orgSlug: string; jobId: string }>;
}) {
  const { orgSlug, jobId } = await params;
  const organization = await getOrganizationContext(orgSlug);
  if (!organization) return <PermissionDenied />;
  const job = await getJob(organization.id, jobId);
  if (!job) notFound();

  return (
    <FadeIn className="max-w-2xl">
      <PageHeader title="Edit job" description={job.title} />
      <div className="rounded-lg border bg-card p-6">
        <JobForm orgSlug={orgSlug} job={job} />
      </div>
    </FadeIn>
  );
}
