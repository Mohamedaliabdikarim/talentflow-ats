import {
  APPLICATION_STAGES,
  type ApplicationStage,
  pipelineFiltersSchema,
} from "@/lib/validation/application";

/** One application as rendered on the Kanban board. Serializable for client components. */
export type PipelineCard = {
  id: string;
  stage: ApplicationStage;
  stageChangedAt: string;
  jobId: string;
  jobTitle: string;
  candidateId: string;
  candidateName: string;
  candidateHeadline: string | null;
};

export type PipelineFilters = { jobId?: string; q?: string };

const DAY_MS = 86_400_000;

/** Groups cards by stage, newest stage change first, with every stage present. */
export function groupByStage(cards: PipelineCard[]): Record<ApplicationStage, PipelineCard[]> {
  const groups: Record<ApplicationStage, PipelineCard[]> = {
    new: [],
    screening: [],
    interview: [],
    offer: [],
    hired: [],
    rejected: [],
  };
  for (const card of cards) groups[card.stage].push(card);
  for (const stage of APPLICATION_STAGES) {
    groups[stage].sort((a, b) => b.stageChangedAt.localeCompare(a.stageChangedAt));
  }
  return groups;
}

/** Escapes LIKE wildcards so a search for "100%" does not become a wildcard query. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export function daysInStage(stageChangedAt: string, now = Date.now()): number {
  const elapsed = now - Date.parse(stageChangedAt);
  if (!Number.isFinite(elapsed) || elapsed < 0) return 0;
  return Math.floor(elapsed / DAY_MS);
}

export function formatStageAge(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

/**
 * Reads ?job=&q= leniently: a malformed job id or the "all" sentinel means no job filter,
 * and the name query is trimmed and capped. Filters never throw on user input.
 */
export function parsePipelineFilters(params: {
  job?: string | string[];
  q?: string | string[];
}): PipelineFilters {
  const job = Array.isArray(params.job) ? params.job[0] : params.job;
  const q = Array.isArray(params.q) ? params.q[0] : params.q;
  const filters: PipelineFilters = {};
  const parsedJob = pipelineFiltersSchema.shape.job.safeParse(job);
  if (parsedJob.success && parsedJob.data) filters.jobId = parsedJob.data;
  const parsedQuery = pipelineFiltersSchema.shape.q.safeParse(q);
  if (parsedQuery.success && parsedQuery.data) filters.q = parsedQuery.data;
  return filters;
}
