import type { PipelineCard, PipelineFilters } from "@/lib/pipeline";
import type { ApplicationStage } from "@/lib/validation/application";
import type { CandidateApplicationRow } from "@/server/data/candidates";
import type { JobApplicationRow, JobListItem } from "@/server/data/jobs";
import {
  type DemoApplication,
  PREVIEW_APPLICATIONS,
  PREVIEW_CANDIDATES,
  PREVIEW_JOBS,
} from "./demo-data";

/**
 * In-memory state for the preview so stage moves persist while the dev server runs.
 * Kept on globalThis to survive hot reloads. It mirrors the server data layer's read
 * models so the real view components can be rendered unchanged.
 */
type PreviewState = { applications: DemoApplication[] };

const globalStore = globalThis as typeof globalThis & { __talentflowPreview?: PreviewState };

function state(): PreviewState {
  globalStore.__talentflowPreview ??= {
    applications: PREVIEW_APPLICATIONS.map((application) => ({ ...application })),
  };
  return globalStore.__talentflowPreview;
}

export function resetPreview(): void {
  delete globalStore.__talentflowPreview;
}

const jobById = new Map(PREVIEW_JOBS.map((job) => [job.id, job]));
const candidateById = new Map(PREVIEW_CANDIDATES.map((candidate) => [candidate.id, candidate]));

export function previewJobs(): JobListItem[] {
  const counts = new Map<string, number>();
  for (const application of state().applications) {
    counts.set(application.job_id, (counts.get(application.job_id) ?? 0) + 1);
  }
  return PREVIEW_JOBS.map(
    ({ id, title, status, location, employment_type, created_at, updated_at }) => ({
      id,
      title,
      status,
      location,
      employment_type,
      created_at,
      updated_at,
      application_count: counts.get(id) ?? 0,
    }),
  ).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function previewJob(jobId: string) {
  return jobById.get(jobId) ?? null;
}

export function previewCandidate(candidateId: string) {
  return candidateById.get(candidateId) ?? null;
}

/** Same semantics as the database search: case-insensitive substring on the full name. */
export function previewCandidates(query?: string) {
  const needle = query?.trim().toLowerCase();
  return PREVIEW_CANDIDATES.filter(
    (candidate) => !needle || candidate.full_name.toLowerCase().includes(needle),
  ).sort((a, b) => a.full_name.localeCompare(b.full_name));
}

export function previewJobApplications(jobId: string): JobApplicationRow[] {
  return state()
    .applications.filter((application) => application.job_id === jobId)
    .map((application) => {
      const candidate = candidateById.get(application.candidate_id)!;
      return {
        id: application.id,
        stage: application.stage,
        stage_changed_at: application.stage_changed_at,
        created_at: application.created_at,
        candidate: {
          id: candidate.id,
          full_name: candidate.full_name,
          headline: candidate.headline,
        },
      };
    })
    .sort((a, b) => b.stage_changed_at.localeCompare(a.stage_changed_at));
}

export function previewCandidateApplications(candidateId: string): CandidateApplicationRow[] {
  return state()
    .applications.filter((application) => application.candidate_id === candidateId)
    .map((application) => {
      const job = jobById.get(application.job_id)!;
      return {
        id: application.id,
        stage: application.stage,
        stage_changed_at: application.stage_changed_at,
        created_at: application.created_at,
        job: { id: job.id, title: job.title, status: job.status },
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function previewCards(filters: PipelineFilters): PipelineCard[] {
  const needle = filters.q?.toLowerCase();
  return state()
    .applications.filter((application) => !filters.jobId || application.job_id === filters.jobId)
    .flatMap((application) => {
      const job = jobById.get(application.job_id);
      const candidate = candidateById.get(application.candidate_id);
      if (!job || !candidate) return [];
      if (needle && !candidate.full_name.toLowerCase().includes(needle)) return [];
      return [
        {
          id: application.id,
          stage: application.stage,
          stageChangedAt: application.stage_changed_at,
          jobId: job.id,
          jobTitle: job.title,
          candidateId: candidate.id,
          candidateName: candidate.full_name,
          candidateHeadline: candidate.headline,
        },
      ];
    })
    .sort((a, b) => b.stageChangedAt.localeCompare(a.stageChangedAt));
}

export function previewCounts() {
  const active = state().applications;
  return {
    jobs: PREVIEW_JOBS.length,
    candidates: PREVIEW_CANDIDATES.length,
    applications: active.length,
    members: 2,
  };
}

/** Returns false when the application does not exist. */
export function movePreviewApplication(applicationId: string, stage: ApplicationStage): boolean {
  const application = state().applications.find((item) => item.id === applicationId);
  if (!application) return false;
  if (application.stage !== stage) {
    application.stage = stage;
    application.stage_changed_at = new Date().toISOString();
  }
  return true;
}

/** Cards plus the snapshot time, mirroring loadPipeline() of the real data layer. */
export function previewSnapshot(filters: PipelineFilters): {
  cards: PipelineCard[];
  generatedAt: number;
} {
  return { cards: previewCards(filters), generatedAt: Date.now() };
}

/** Pristine demo cards (ignores in-memory moves), for the landing page showcase. */
export function demoCardsSnapshot(): { cards: PipelineCard[]; generatedAt: number } {
  const cards = PREVIEW_APPLICATIONS.flatMap((application) => {
    const job = jobById.get(application.job_id);
    const candidate = candidateById.get(application.candidate_id);
    if (!job || !candidate) return [];
    return [
      {
        id: application.id,
        stage: application.stage,
        stageChangedAt: application.stage_changed_at,
        jobId: job.id,
        jobTitle: job.title,
        candidateId: candidate.id,
        candidateName: candidate.full_name,
        candidateHeadline: candidate.headline,
      },
    ];
  }).sort((a, b) => b.stageChangedAt.localeCompare(a.stageChangedAt));
  return { cards, generatedAt: Date.now() };
}
