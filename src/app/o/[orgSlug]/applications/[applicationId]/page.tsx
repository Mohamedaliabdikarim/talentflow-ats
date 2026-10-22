import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { PermissionDenied } from "@/components/permission-denied";
import { ApplicationDetailView } from "@/components/views/application-detail";
import { isAzureOpenAIConfigured } from "@/lib/ai/client";
import { isUuid } from "@/lib/validation/id";
import { getOrganizationContext } from "@/server/auth";
import { getApplicationDetail, getLatestApplicationInsight } from "@/server/data/insights";

type Params = Promise<{ orgSlug: string; applicationId: string }>;

/** One application read per request, shared by the page title and the page body. */
const loadApplication = cache(getApplicationDetail);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { orgSlug, applicationId } = await params;
  const organization = await getOrganizationContext(orgSlug);
  const application =
    organization && isUuid(applicationId)
      ? await loadApplication(organization.id, applicationId)
      : null;
  return {
    title: application
      ? `${application.candidate.fullName} · ${application.job.title}`
      : "Application",
  };
}

/**
 * Application detail (candidate × job) hosting the Candidate Insights panel (ADR-035). Tenant
 * access is checked here and again in every action the panel calls; data is RLS-scoped.
 */
export default async function ApplicationDetailPage({ params }: { params: Params }) {
  const { orgSlug, applicationId } = await params;
  const organization = await getOrganizationContext(orgSlug);
  if (!organization) return <PermissionDenied />;
  if (!isUuid(applicationId)) notFound();

  // Both reads are RLS-scoped by organization and keyed by the route id, so they run in one
  // round trip (ADR-042); a missing application still ends in notFound().
  const [application, insight] = await Promise.all([
    loadApplication(organization.id, applicationId),
    getLatestApplicationInsight(organization.id, applicationId),
  ]);
  if (!application) notFound();

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
