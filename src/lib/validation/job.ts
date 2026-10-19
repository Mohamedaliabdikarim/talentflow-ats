import { z } from "zod";
import { optionalText } from "./common";

export const JOB_STATUSES = ["draft", "open", "closed"] as const;
export const jobStatusSchema = z.enum(JOB_STATUSES);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  draft: "Draft",
  open: "Open",
  closed: "Closed",
};

export const jobInputSchema = z.object({
  title: z.string().trim().min(2, "Enter a job title").max(160),
  description: z.string().trim().max(20_000).default(""),
  location: optionalText(120),
  employmentType: optionalText(60),
  status: jobStatusSchema.default("open"),
});

export type JobInput = z.infer<typeof jobInputSchema>;
