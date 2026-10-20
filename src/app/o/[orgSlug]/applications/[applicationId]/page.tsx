import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PermissionDenied } from "@/components/permission-denied";
import { ApplicationDetailView } from "@/components/views/application-detail";
import { isAzureOpenAIConfigured } from "@/lib/ai/client";
import { getOrganizationContext } from "@/server/auth";
import { getApplicationDetail, getLatestApplicationInsight } from "@/server/data/insights";

export const metadata: Metadata = { title: "Application" };

/**
 * Application detail (candidate × job) hosting the Candidate Insights panel (ADR-035). Tenant
 * access is checked here and again in every action the panel calls; data is RLS-scoped.
 */
export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; applicationId: string }>;
}) {
  const { orgSlug, applicationId } = await params;
  const organization = await getOrganizationContext(orgSlug);
  if (!organization) return <PermissionDenied />;

  const application = await getApplicationDetail(organization.id, applicationId);
  if (!application) notFound();
  const insight = await getLatestApplicationInsight(organization.id, application.id);

  return (
    <ApplicationDetailView
      base={`/o/${orgSlug}`}
      orgSlug={orgSlug}
      application={application}
      insight={insight}
      aiConfigured={isAzureOpenAIConfigured()}
    />
  );
}
