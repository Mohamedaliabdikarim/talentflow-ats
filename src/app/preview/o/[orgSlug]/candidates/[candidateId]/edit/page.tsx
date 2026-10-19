import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CandidateForm } from "@/components/forms/candidate-form";
import { FadeIn } from "@/components/motion/fade-in";
import { PageHeader } from "@/components/page-header";
import { PREVIEW_ORG_SLUG } from "@/preview/enabled";
import { previewCandidate } from "@/preview/store";

export const metadata: Metadata = { title: "Edit candidate (preview)" };

export default async function PreviewEditCandidatePage({
  params,
}: {
  params: Promise<{ candidateId: string }>;
}) {
  const { candidateId } = await params;
  const candidate = previewCandidate(candidateId);
  if (!candidate) notFound();
  return (
    <FadeIn className="max-w-2xl">
      <PageHeader
        title="Edit candidate"
        description={`${candidate.full_name} · controls are disabled in the preview.`}
      />
      <fieldset disabled className="m-0 rounded-lg border bg-card p-6">
        <CandidateForm orgSlug={PREVIEW_ORG_SLUG} candidate={candidate} />
      </fieldset>
    </FadeIn>
  );
}
