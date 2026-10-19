import "server-only";
import { escapeLikePattern } from "@/lib/pipeline";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Enums, Tables } from "@/lib/supabase/database.types";

export type CandidateListItem = Pick<
  Tables<"candidates">,
  | "id"
  | "full_name"
  | "email"
  | "headline"
  | "location"
  | "linkedin_url"
  | "github_url"
  | "created_at"
>;

export type CandidateOption = { id: string; full_name: string };

export type CandidateApplicationRow = {
  id: string;
  stage: Enums<"application_stage">;
  stage_changed_at: string;
  created_at: string;
  job: { id: string; title: string; status: Enums<"job_status"> };
};

/** Lists candidates of the organization, optionally matching a case-insensitive name fragment. */
export async function listCandidates(
  organizationId: string,
  query?: string,
): Promise<CandidateListItem[]> {
  const supabase = await createServerSupabase();
  let request = supabase
    .from("candidates")
    .select("id, full_name, email, headline, location, linkedin_url, github_url, created_at")
    .eq("organization_id", organizationId)
    .order("full_name", { ascending: true });
  if (query) {
    request = request.ilike("full_name", `%${escapeLikePattern(query)}%`);
  }
  const { data, error } = await request;
  if (error) throw new Error(`Could not list candidates: ${error.message}`);
  return data ?? [];
}

export async function getCandidate(organizationId: string, candidateId: string) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("candidates")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", candidateId)
    .maybeSingle();
  if (error) throw new Error(`Could not load candidate: ${error.message}`);
  return data;
}

export async function listCandidateOptions(organizationId: string): Promise<CandidateOption[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("candidates")
    .select("id, full_name")
    .eq("organization_id", organizationId)
    .order("full_name", { ascending: true });
  if (error) throw new Error(`Could not list candidates: ${error.message}`);
  return data ?? [];
}

export async function listCandidateApplications(
  organizationId: string,
  candidateId: string,
): Promise<CandidateApplicationRow[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("applications")
    .select("id, stage, stage_changed_at, created_at, job:jobs(id, title, status)")
    .eq("organization_id", organizationId)
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not list applications: ${error.message}`);
  return (data ?? []).flatMap((row) => (row.job ? [{ ...row, job: row.job }] : []));
}
