import type { Metadata } from "next";
import { PermissionDenied } from "@/components/permission-denied";
import { FadeIn } from "@/components/motion/fade-in";
import { PageHeader, StatCard } from "@/components/page-header";
import { getOrganizationContext } from "@/server/auth";
import { getWorkspaceCounts } from "@/server/data/workspace";

export const metadata: Metadata = { title: "Workspace" };

export default async function WorkspaceOverviewPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const organization = await getOrganizationContext(orgSlug);
  if (!organization) return <PermissionDenied />;
  const counts = await getWorkspaceCounts(organization.id);

  return (
    <FadeIn>
      <PageHeader
        title={organization.name}
        description="Jobs, candidates and the hiring pipeline arrive in the next phases; the numbers below are live counts for this workspace."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Jobs" value={counts.jobs} />
        <StatCard label="Candidates" value={counts.candidates} />
        <StatCard label="Applications" value={counts.applications} />
        <StatCard label="Members" value={counts.members} />
      </div>
    </FadeIn>
  );
}
