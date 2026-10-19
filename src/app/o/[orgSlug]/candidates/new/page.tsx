import type { Metadata } from "next";
import { CandidateForm } from "@/components/forms/candidate-form";
import { FadeIn } from "@/components/motion/fade-in";
import { PageHeader } from "@/components/page-header";
import { PermissionDenied } from "@/components/permission-denied";
import { getOrganizationContext } from "@/server/auth";
import { listJobOptions } from "@/server/data/jobs";

export const metadata: Metadata = { title: "Add candidate" };

export default async function NewCandidatePage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ job?: string }>;
}) {
  const { orgSlug } = await params;
  const organization = await getOrganizationContext(orgSlug);
  if (!organization) return <PermissionDenied />;
  const { job: requestedJobId } = await searchParams;
  const jobs = (await listJobOptions(organization.id)).filter((job) => job.status !== "closed");
  const defaultJobId = jobs.some((job) => job.id === requestedJobId) ? requestedJobId : undefined;

  return (
    <FadeIn className="max-w-2xl">
      <PageHeader
        title="Add candidate"
        description="Only the name is required. Profile links are stored for manual review."
      />
      <div className="rounded-lg border bg-card p-6">
        <CandidateForm orgSlug={orgSlug} jobOptions={jobs} defaultJobId={defaultJobId} />
      </div>
    </FadeIn>
  );
}
