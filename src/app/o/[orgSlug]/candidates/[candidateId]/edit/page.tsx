import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CandidateForm } from "@/components/forms/candidate-form";
import { FadeIn } from "@/components/motion/fade-in";
import { PageHeader } from "@/components/page-header";
import { PermissionDenied } from "@/components/permission-denied";
import { getOrganizationContext } from "@/server/auth";
import { getCandidate } from "@/server/data/candidates";

export const metadata: Metadata = { title: "Edit candidate" };

export default async function EditCandidatePage({
  params,
}: {
  params: Promise<{ orgSlug: string; candidateId: string }>;
}) {
  const { orgSlug, candidateId } = await params;
  const organization = await getOrganizationContext(orgSlug);
  if (!organization) return <PermissionDenied />;
  const candidate = await getCandidate(organization.id, candidateId);
  if (!candidate) notFound();

  return (
    <FadeIn className="max-w-2xl">
      <PageHeader title="Edit candidate" description={candidate.full_name} />
      <div className="rounded-lg border bg-card p-6">
        <CandidateForm orgSlug={orgSlug} candidate={candidate} />
      </div>
    </FadeIn>
  );
}
