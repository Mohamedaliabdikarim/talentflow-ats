import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { CandidateForm } from "@/components/forms/candidate-form";
import { FadeIn } from "@/components/motion/fade-in";
import { PageHeader } from "@/components/page-header";
import { PermissionDenied } from "@/components/permission-denied";
import { isUuid } from "@/lib/validation/id";
import { getOrganizationContext } from "@/server/auth";
import { getCandidate } from "@/server/data/candidates";

type Params = Promise<{ orgSlug: string; candidateId: string }>;

const loadCandidate = cache(getCandidate);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { orgSlug, candidateId } = await params;
  const organization = await getOrganizationContext(orgSlug);
  const candidate =
    organization && isUuid(candidateId) ? await loadCandidate(organization.id, candidateId) : null;
  return { title: candidate ? `Edit ${candidate.full_name}` : "Edit candidate" };
}

export default async function EditCandidatePage({ params }: { params: Params }) {
  const { orgSlug, candidateId } = await params;
  const organization = await getOrganizationContext(orgSlug);
  if (!organization) return <PermissionDenied />;
  if (!isUuid(candidateId)) notFound();
  const candidate = await loadCandidate(organization.id, candidateId);
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
