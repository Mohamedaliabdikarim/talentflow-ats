import Link from "next/link";
import { KanbanBoard, type MoveAction } from "@/components/kanban/kanban-board";
import { PipelineFilters } from "@/components/kanban/pipeline-filters";
import { FadeIn } from "@/components/motion/fade-in";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import type { PipelineCard, PipelineFilters as Filters } from "@/lib/pipeline";
import type { JobOption } from "@/server/data/jobs";

type PipelineViewProps = {
  base: string;
  orgSlug: string;
  jobs: JobOption[];
  filters: Filters;
  cards: PipelineCard[];
  generatedAt: number;
  /** Overrides the Server Action used for stage moves (preview mode). */
  moveAction?: MoveAction;
};

export function PipelineView({
  base,
  orgSlug,
  jobs,
  filters,
  cards,
  generatedAt,
  moveAction,
}: PipelineViewProps) {
  const activeJob = filters.jobId ? jobs.find((job) => job.id === filters.jobId) : undefined;
  const hasFilters = Boolean(filters.jobId || filters.q);

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
      <PipelineFilters base={base} jobs={jobs} filters={filters} />
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
        <KanbanBoard
          orgSlug={orgSlug}
          basePath={base}
          cards={cards}
          now={generatedAt}
          moveAction={moveAction}
        />
      )}
    </FadeIn>
  );
}
