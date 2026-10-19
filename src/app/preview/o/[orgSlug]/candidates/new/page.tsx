import type { Metadata } from "next";
import { CandidateForm } from "@/components/forms/candidate-form";
import { FadeIn } from "@/components/motion/fade-in";
import { PageHeader } from "@/components/page-header";
import { PREVIEW_JOBS } from "@/preview/demo-data";
import { PREVIEW_ORG_SLUG } from "@/preview/enabled";

export const metadata: Metadata = { title: "Add candidate (preview)" };

export default function PreviewNewCandidatePage() {
  const jobs = PREVIEW_JOBS.filter((job) => job.status !== "closed");
  return (
    <FadeIn className="max-w-2xl">
      <PageHeader
        title="Add candidate"
        description="Form shown for visual review; controls are disabled in the preview."
      />
      <fieldset disabled className="m-0 rounded-lg border bg-card p-6">
        <CandidateForm orgSlug={PREVIEW_ORG_SLUG} jobOptions={jobs} />
      </fieldset>
    </FadeIn>
  );
}
