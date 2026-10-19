import type { Metadata } from "next";
import Link from "next/link";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { PipelineFilters } from "@/components/kanban/pipeline-filters";
import { FadeIn } from "@/components/motion/fade-in";
import { EmptyState, PageHeader } from "@/components/page-header";
import { PermissionDenied } from "@/components/permission-denied";
import { Button } from "@/components/ui/button";
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
  const activeJob = filters.jobId ? jobs.find((job) => job.id === filters.jobId) : undefined;
  const hasFilters = Boolean(filters.jobId || filters.q);
  const base = `/o/${orgSlug}`;

  return (
    <FadeIn>
      <PageHeader
        title="Pipeline"
        description={
          activeJob
            ? `Applications for ${activeJob.title}, grouped by stage.`
            : "All applications across jobs, grouped by stage."
        }
        actions={
          <Button asChild variant="outline">
            <Link href={`${base}/candidates/new`}>Add candidate</Link>
          </Button>
        }
      />
      <PipelineFilters orgSlug={orgSlug} jobs={jobs} filters={filters} />
      {cards.length === 0 ? (
        hasFilters ? (
          <EmptyState
            title="No applications match these filters"
            description="Try another job, a different spelling, or clear the filters."
            action={
              <Button asChild variant="outline">
                <Link href={`${base}/pipeline`}>Clear filters</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="No applications yet"
            description="Add a candidate to a job and they will appear here in the New stage."
            action={
              <Button asChild>
                <Link href={`${base}/candidates/new`}>Add candidate</Link>
              </Button>
            }
          />
        )
      ) : (
        <KanbanBoard orgSlug={orgSlug} cards={cards} now={generatedAt} />
      )}
    </FadeIn>
  );
}
