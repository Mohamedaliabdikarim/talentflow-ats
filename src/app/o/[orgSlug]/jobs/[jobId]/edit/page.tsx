import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { JobForm } from "@/components/forms/job-form";
import { FadeIn } from "@/components/motion/fade-in";
import { PageHeader } from "@/components/page-header";
import { PermissionDenied } from "@/components/permission-denied";
import { isUuid } from "@/lib/validation/id";
import { getOrganizationContext } from "@/server/auth";
import { getJob } from "@/server/data/jobs";

type Params = Promise<{ orgSlug: string; jobId: string }>;

const loadJob = cache(getJob);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { orgSlug, jobId } = await params;
  const organization = await getOrganizationContext(orgSlug);
  const job = organization && isUuid(jobId) ? await loadJob(organization.id, jobId) : null;
  return { title: job ? `Edit ${job.title}` : "Edit job" };
}

export default async function EditJobPage({ params }: { params: Params }) {
  const { orgSlug, jobId } = await params;
  const organization = await getOrganizationContext(orgSlug);
  if (!organization) return <PermissionDenied />;
  if (!isUuid(jobId)) notFound();
  const job = await loadJob(organization.id, jobId);
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
