import type { Metadata } from "next";
import { CreateOrganizationForm } from "@/components/forms/create-organization-form";
import { FadeIn } from "@/components/motion/fade-in";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Create organization (preview)" };

export default function PreviewNewOrganizationPage() {
  return (
    <FadeIn className="max-w-lg">
      <PageHeader
        title="Create organization"
        description="Form shown for visual review; controls are disabled in the preview."
      />
      <fieldset disabled className="m-0 rounded-lg border bg-card p-6">
        <CreateOrganizationForm />
      </fieldset>
    </FadeIn>
  );
}
