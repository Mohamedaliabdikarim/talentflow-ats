import type { Metadata } from "next";
import Link from "next/link";
import { FadeIn } from "@/components/motion/fade-in";
import { PageHeader, StatCard } from "@/components/page-header";
import { PermissionDenied } from "@/components/permission-denied";
import { Button } from "@/components/ui/button";
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
  const base = `/o/${orgSlug}`;

  return (
    <FadeIn>
      <PageHeader
        title={organization.name}
        description="Live counts for this workspace."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`${base}/jobs/new`}>Post job</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`${base}/candidates/new`}>Add candidate</Link>
            </Button>
            <Button asChild>
              <Link href={`${base}/pipeline`}>Open pipeline</Link>
            </Button>
          </>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href={`${base}/jobs`}
          className="rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <StatCard label="Jobs" value={counts.jobs} />
        </Link>
        <Link
          href={`${base}/candidates`}
          className="rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <StatCard label="Candidates" value={counts.candidates} />
        </Link>
        <Link
          href={`${base}/pipeline`}
          className="rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <StatCard label="Applications" value={counts.applications} />
        </Link>
        <Link
          href={`${base}/members`}
          className="rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <StatCard label="Members" value={counts.members} />
        </Link>
      </div>
    </FadeIn>
  );
}
