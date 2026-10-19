import type { Metadata } from "next";
import { PermissionDenied } from "@/components/permission-denied";
import { JobsView } from "@/components/views/jobs-table";
import { getOrganizationContext } from "@/server/auth";
import { listJobs } from "@/server/data/jobs";

export const metadata: Metadata = { title: "Jobs" };

export default async function JobsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const organization = await getOrganizationContext(orgSlug);
  if (!organization) return <PermissionDenied />;
  const jobs = await listJobs(organization.id);
  return <JobsView base={`/o/${orgSlug}`} jobs={jobs} />;
}
