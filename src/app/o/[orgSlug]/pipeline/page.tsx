import type { Metadata } from "next";
import { PermissionDenied } from "@/components/permission-denied";
import { PipelineView } from "@/components/views/pipeline";
import { parsePipelineFilters } from "@/lib/pipeline";
import { getOrganizationContext } from "@/server/auth";
import { listJobOptions } from "@/server/data/jobs";
import { loadPipeline } from "@/server/data/pipeline";

export const metadata: Metadata = { title: "Pipeline" };

export default async function PipelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ job?: string | string[]; q?: string | string[] }>;
}) {
  const { orgSlug } = await params;
  const organization = await getOrganizationContext(orgSlug);
  if (!organization) return <PermissionDenied />;

  const filters = parsePipelineFilters(await searchParams);
  const [{ cards, generatedAt }, jobs] = await Promise.all([
    loadPipeline(organization.id, filters),
    listJobOptions(organization.id),
  ]);

  return (
    <PipelineView
      base={`/o/${orgSlug}`}
      orgSlug={orgSlug}
      jobs={jobs}
      filters={filters}
      cards={cards}
      generatedAt={generatedAt}
    />
  );
}
