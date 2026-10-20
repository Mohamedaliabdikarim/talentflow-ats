import "server-only";
import {
  EVIDENCE_SOURCES,
  type EvidenceSource,
  type JobMatchResult,
  parseJobMatchResult,
} from "@/lib/ai/insights-contract";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Enums } from "@/lib/supabase/database.types";

/**
 * Read models for the application detail view and its Candidate Insights panel. Everything goes
 * through the user-scoped client (RLS); the CV itself is never read here.
 */

export type InsightStatus = Enums<"insight_status">;

export type ApplicationDetail = {
  id: string;
  stage: Enums<"application_stage">;
  stageChangedAt: string;
  createdAt: string;
  candidate: {
    id: string;
    fullName: string;
    headline: string | null;
    cvPresent: boolean;
    aiAuthorized: boolean;
    aiAuthorizedAt: string | null;
    githubUrl: string | null;
    githubAiAuthorized: boolean;
    githubAiAuthorizedAt: string | null;
  };
  job: { id: string; title: string; status: Enums<"job_status"> };
};

/** Why GitHub evidence was or was not part of a run (docs/AI_INSIGHTS.md §8.3). */
export type GithubEvidenceStatus =
  | "not_provided"
  | "invalid_url"
  | "not_authorized"
  | "included"
  | "not_found"
  | "rate_limited"
  | "unavailable"
  | "withdrawn";

const GITHUB_STATUSES: ReadonlySet<string> = new Set<GithubEvidenceStatus>([
  "not_provided",
  "invalid_url",
  "not_authorized",
  "included",
  "not_found",
  "rate_limited",
  "unavailable",
  "withdrawn",
]);

/** What the UI needs from an insight row; `result` is present only for a validated `ready` row. */
export type InsightView = {
  id: string;
  status: InsightStatus;
  result: JobMatchResult | null;
  errorMessage: string | null;
  generatedAt: string | null;
  modelVersion: string | null;
  contractVersion: string | null;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  /** Evidence kinds the run used (planned while in flight, actual once ready). */
  evidenceSources: EvidenceSource[];
  githubLogin: string | null;
  githubStatus: GithubEvidenceStatus | null;
  /** Repository URLs given to the model; the only ones rendered as links. */
  sourceUrls: string[];
};

export const INSIGHT_VIEW_COLUMNS =
  "id, status, result, error_message, generated_at, model_version, contract_version, attempt_count, created_at, updated_at, evidence_sources, github_login, github_status, source_urls";

type InsightRow = {
  id: string;
  status: InsightStatus;
  result: unknown;
  error_message: string | null;
  generated_at: string | null;
  model_version: string | null;
  contract_version: string | null;
  attempt_count: number;
  created_at: string;
  updated_at: string;
  evidence_sources: string[];
  github_login: string | null;
  github_status: string | null;
  source_urls: string[];
};

/**
 * Maps a row to the view. A `ready` row whose stored result no longer validates against the
 * current contract (legacy results are normalised first) is shown as failed rather than rendered
 * partially (never a fabricated view).
 */
export function toInsightView(row: InsightRow): InsightView {
  let result: JobMatchResult | null = null;
  let status = row.status;
  let errorMessage = row.error_message;
  if (row.status === "ready") {
    const parsed = parseJobMatchResult(row.result);
    if (parsed.ok) {
      result = parsed.result;
    } else {
      status = "failed";
      errorMessage = "The stored result does not match the current contract. Regenerate it.";
    }
  }
  return {
    id: row.id,
    status,
    result,
    errorMessage,
    generatedAt: row.generated_at,
    modelVersion: row.model_version,
    contractVersion: row.contract_version,
    attemptCount: row.attempt_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    evidenceSources: (row.evidence_sources ?? []).filter((source): source is EvidenceSource =>
      (EVIDENCE_SOURCES as readonly string[]).includes(source),
    ),
    githubLogin: row.github_login,
    githubStatus:
      row.github_status && GITHUB_STATUSES.has(row.github_status)
        ? (row.github_status as GithubEvidenceStatus)
        : null,
    sourceUrls: row.source_urls ?? [],
  };
}

export async function getApplicationDetail(
  organizationId: string,
  applicationId: string,
): Promise<ApplicationDetail | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("applications")
    .select(
      "id, stage, stage_changed_at, created_at, candidate:candidates(id, full_name, headline, cv_object_key, cv_ai_authorized, cv_ai_authorized_at, github_url, github_ai_authorized, github_ai_authorized_at), job:jobs(id, title, status)",
    )
    .eq("organization_id", organizationId)
    .eq("id", applicationId)
    .maybeSingle();
  if (error) throw new Error(`Could not load application: ${error.message}`);
  if (!data || !data.candidate || !data.job) return null;
  return {
    id: data.id,
    stage: data.stage,
    stageChangedAt: data.stage_changed_at,
    createdAt: data.created_at,
    candidate: {
      id: data.candidate.id,
      fullName: data.candidate.full_name,
      headline: data.candidate.headline,
      cvPresent: data.candidate.cv_object_key !== null,
      aiAuthorized: data.candidate.cv_ai_authorized,
      aiAuthorizedAt: data.candidate.cv_ai_authorized_at,
      githubUrl: data.candidate.github_url,
      githubAiAuthorized: data.candidate.github_ai_authorized,
      githubAiAuthorizedAt: data.candidate.github_ai_authorized_at,
    },
    job: { id: data.job.id, title: data.job.title, status: data.job.status },
  };
}

/** The most recent analysis for an application (any status), or null when none was ever queued. */
export async function getLatestApplicationInsight(
  organizationId: string,
  applicationId: string,
): Promise<InsightView | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("candidate_ai_insights")
    .select(INSIGHT_VIEW_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not load insight: ${error.message}`);
  return data ? toInsightView(data) : null;
}
