import type { Metadata } from "next";
import { PermissionDenied } from "@/components/permission-denied";
import { WorkspaceOverviewView } from "@/components/views/workspace-overview";
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
    <WorkspaceOverviewView
      base={`/o/${orgSlug}`}
      organizationName={organization.name}
      counts={counts}
    />
  );
}
