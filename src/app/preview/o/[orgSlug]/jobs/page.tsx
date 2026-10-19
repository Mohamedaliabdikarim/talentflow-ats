import type { Metadata } from "next";
import { JobsView } from "@/components/views/jobs-table";
import { PREVIEW_BASE } from "@/preview/enabled";
import { previewJobs } from "@/preview/store";

export const metadata: Metadata = { title: "Jobs (preview)" };

export default function PreviewJobsPage() {
  return <JobsView base={PREVIEW_BASE} jobs={previewJobs()} />;
}
