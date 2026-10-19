import Link from "next/link";
import { FadeIn } from "@/components/motion/fade-in";
import { PageHeader, StatCard } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export type WorkspaceCounts = {
  jobs: number;
  candidates: number;
  applications: number;
  members: number;
};

const CARD_LINK =
  "rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/** Workspace landing page body; `base` is the workspace root path (real or preview). */
export function WorkspaceOverviewView({
  base,
  organizationName,
  counts,
}: {
  base: string;
  organizationName: string;
  counts: WorkspaceCounts;
}) {
  return (
    <FadeIn>
      <PageHeader
        title={organizationName}
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
        <Link href={`${base}/jobs`} className={CARD_LINK}>
          <StatCard label="Jobs" value={counts.jobs} />
        </Link>
        <Link href={`${base}/candidates`} className={CARD_LINK}>
          <StatCard label="Candidates" value={counts.candidates} />
        </Link>
        <Link href={`${base}/pipeline`} className={CARD_LINK}>
          <StatCard label="Applications" value={counts.applications} />
        </Link>
        <Link href={`${base}/members`} className={CARD_LINK}>
          <StatCard label="Members" value={counts.members} />
        </Link>
      </div>
    </FadeIn>
  );
}
