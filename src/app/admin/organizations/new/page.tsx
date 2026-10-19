import type { Metadata } from "next";
import { CreateOrganizationForm } from "@/components/forms/create-organization-form";
import { FadeIn } from "@/components/motion/fade-in";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Create organization" };

export default function NewOrganizationPage() {
  return (
    <FadeIn className="max-w-lg">
      <PageHeader
        title="Create organization"
        description="Creates an empty, isolated workspace. You can invite its first user on the next screen."
      />
      <div className="rounded-lg border bg-card p-6">
        <CreateOrganizationForm />
      </div>
    </FadeIn>
  );
}
