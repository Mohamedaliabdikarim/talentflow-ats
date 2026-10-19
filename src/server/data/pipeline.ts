import "server-only";
import { escapeLikePattern, type PipelineCard, type PipelineFilters } from "@/lib/pipeline";
import { createServerSupabase } from "@/lib/supabase/server";

export type PipelineSnapshot = {
  cards: PipelineCard[];
  /** Server time of the snapshot; the board uses it for "days in stage" on both ends. */
  generatedAt: number;
};

/**
 * Applications for the Kanban board with optional job and candidate-name filters.
 * The name filter resolves matching candidate ids first (RLS-scoped) and then restricts
 * the applications query, so both filters are applied in the database and combine.
 */
export async function loadPipeline(
  organizationId: string,
  filters: PipelineFilters,
): Promise<PipelineSnapshot> {
  return { cards: await listPipelineCards(organizationId, filters), generatedAt: Date.now() };
}

export async function listPipelineCards(
  organizationId: string,
  filters: PipelineFilters,
): Promise<PipelineCard[]> {
  const supabase = await createServerSupabase();

  let candidateIds: string[] | null = null;
  if (filters.q) {
    const { data, error } = await supabase
      .from("candidates")
      .select("id")
      .eq("organization_id", organizationId)
      .ilike("full_name", `%${escapeLikePattern(filters.q)}%`);
    if (error) throw new Error(`Could not search candidates: ${error.message}`);
    candidateIds = (data ?? []).map((row) => row.id);
    if (candidateIds.length === 0) return [];
  }

  let request = supabase
    .from("applications")
    .select(
      "id, stage, stage_changed_at, job:jobs(id, title), candidate:candidates(id, full_name, headline)",
    )
    .eq("organization_id", organizationId)
    .order("stage_changed_at", { ascending: false });
  if (filters.jobId) request = request.eq("job_id", filters.jobId);
  if (candidateIds) request = request.in("candidate_id", candidateIds);

  const { data, error } = await request;
  if (error) throw new Error(`Could not load the pipeline: ${error.message}`);

  return (data ?? []).flatMap((row) => {
    if (!row.job || !row.candidate) return [];
    return [
      {
        id: row.id,
        stage: row.stage,
        stageChangedAt: row.stage_changed_at,
        jobId: row.job.id,
        jobTitle: row.job.title,
        candidateId: row.candidate.id,
        candidateName: row.candidate.full_name,
        candidateHeadline: row.candidate.headline,
      },
    ];
  });
}
