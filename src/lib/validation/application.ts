import { z } from "zod";

/** Pipeline order matters: the Kanban renders columns in this sequence. */
export const APPLICATION_STAGES = [
  "new",
  "screening",
  "interview",
  "offer",
  "hired",
  "rejected",
] as const;

export const applicationStageSchema = z.enum(APPLICATION_STAGES);
export type ApplicationStage = z.infer<typeof applicationStageSchema>;

export const STAGE_LABELS: Record<ApplicationStage, string> = {
  new: "New",
  screening: "Screening",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
};

export const createApplicationSchema = z.object({
  jobId: z.uuid(),
  candidateId: z.uuid(),
});

export const moveApplicationSchema = z.object({
  applicationId: z.uuid(),
  stage: applicationStageSchema,
});

/** Pipeline filters live in the URL (?job=<uuid>&q=<name>) so a filtered board can be shared. */
export const pipelineFiltersSchema = z.object({
  job: z.uuid().optional(),
  q: z.string().trim().max(160).optional(),
});

export type PipelineFilters = z.infer<typeof pipelineFiltersSchema>;
