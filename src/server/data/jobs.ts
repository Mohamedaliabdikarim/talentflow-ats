import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Enums, Tables } from "@/lib/supabase/database.types";

/**
 * Job read models. Every query is additionally filtered by organization_id even though
 * RLS already scopes rows: the explicit filter documents intent and keeps the query plan
 * on the (organization_id, status) index.
 */

export type JobListItem = Pick<
  Tables<"jobs">,
  "id" | "title" | "status" | "location" | "employment_type" | "created_at" | "updated_at"
> & { application_count: number };

export type JobOption = { id: string; title: string; status: Enums<"job_status"> };

export type JobApplicationRow = {
  id: string;
  stage: Enums<"application_stage">;
  stage_changed_at: string;
  created_at: string;
  candidate: { id: string; full_name: string; headline: string | null };
};

export async function listJobs(organizationId: string): Promise<JobListItem[]> {
  const supabase = await createServerSupabase();
  const [jobs, applications] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, title, status, location, employment_type, created_at, updated_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
    supabase.from("applications").select("job_id").eq("organization_id", organizationId),
  ]);
  if (jobs.error) throw new Error(`Could not list jobs: ${jobs.error.message}`);
  const counts = new Map<string, number>();
  for (const application of applications.data ?? []) {
    counts.set(application.job_id, (counts.get(application.job_id) ?? 0) + 1);
  }
  return (jobs.data ?? []).map((job) => ({ ...job, application_count: counts.get(job.id) ?? 0 }));
}

export async function getJob(organizationId: string, jobId: string) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw new Error(`Could not load job: ${error.message}`);
  return data;
}

/** Jobs a candidate can be added to (open and draft; closed jobs are excluded). */
export async function listJobOptions(organizationId: string): Promise<JobOption[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("jobs")
    .select("id, title, status")
    .eq("organization_id", organizationId)
    .order("title", { ascending: true });
  if (error) throw new Error(`Could not list jobs: ${error.message}`);
  return data ?? [];
}

export async function listJobApplications(
  organizationId: string,
  jobId: string,
): Promise<JobApplicationRow[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("applications")
    .select(
      "id, stage, stage_changed_at, created_at, candidate:candidates(id, full_name, headline)",
    )
    .eq("organization_id", organizationId)
    .eq("job_id", jobId)
    .order("stage_changed_at", { ascending: false });
  if (error) throw new Error(`Could not list applications: ${error.message}`);
  return (data ?? []).flatMap((row) =>
    row.candidate ? [{ ...row, candidate: row.candidate }] : [],
  );
}
