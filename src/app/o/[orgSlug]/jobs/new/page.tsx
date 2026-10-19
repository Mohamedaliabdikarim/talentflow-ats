import type { Metadata } from "next";
import { JobForm } from "@/components/forms/job-form";
import { FadeIn } from "@/components/motion/fade-in";
import { PageHeader } from "@/components/page-header";
import { PermissionDenied } from "@/components/permission-denied";
import { getOrganizationContext } from "@/server/auth";

export const metadata: Metadata = { title: "Post job" };

export default async function NewJobPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const organization = await getOrganizationContext(orgSlug);
  if (!organization) return <PermissionDenied />;

  return (
    <FadeIn className="max-w-2xl">
      <PageHeader title="Post job" description="Creates a job in this workspace." />
      <div className="rounded-lg border bg-card p-6">
        <JobForm orgSlug={orgSlug} />
      </div>
    </FadeIn>
  );
}
