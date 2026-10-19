import type { Metadata } from "next";
import { PipelineView } from "@/components/views/pipeline";
import { parsePipelineFilters } from "@/lib/pipeline";
import { previewMoveApplicationStageAction } from "@/preview/actions";
import { PREVIEW_JOBS } from "@/preview/demo-data";
import { PREVIEW_BASE, PREVIEW_ORG_SLUG } from "@/preview/enabled";
import { previewSnapshot } from "@/preview/store";

export const metadata: Metadata = { title: "Pipeline (preview)" };

export default async function PreviewPipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string | string[]; q?: string | string[] }>;
}) {
  const filters = parsePipelineFilters(await searchParams);
  const { cards, generatedAt } = previewSnapshot(filters);
  const jobs = PREVIEW_JOBS.map(({ id, title, status }) => ({ id, title, status }));
  return (
    <PipelineView
      base={PREVIEW_BASE}
      orgSlug={PREVIEW_ORG_SLUG}
      jobs={jobs}
      filters={filters}
      cards={cards}
      generatedAt={generatedAt}
      moveAction={previewMoveApplicationStageAction}
    />
  );
}
