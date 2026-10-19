import type { Metadata } from "next";
import { JobForm } from "@/components/forms/job-form";
import { FadeIn } from "@/components/motion/fade-in";
import { PageHeader } from "@/components/page-header";
import { PREVIEW_ORG_SLUG } from "@/preview/enabled";

export const metadata: Metadata = { title: "Post job (preview)" };

export default function PreviewNewJobPage() {
  return (
    <FadeIn className="max-w-2xl">
      <PageHeader
        title="Post job"
        description="Form shown for visual review; controls are disabled in the preview."
      />
      <fieldset disabled className="m-0 rounded-lg border bg-card p-6">
        <JobForm orgSlug={PREVIEW_ORG_SLUG} />
      </fieldset>
    </FadeIn>
  );
}
