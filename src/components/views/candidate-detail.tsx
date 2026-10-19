import Link from "next/link";
import { Pencil } from "lucide-react";
import { ExternalLink } from "@/components/external-link";
import { FadeIn } from "@/components/motion/fade-in";
import { formatDateTime, PageHeader } from "@/components/page-header";
import { StageBadge } from "@/components/stage-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Tables } from "@/lib/supabase/database.types";
import type { CandidateApplicationRow } from "@/server/data/candidates";

type CandidateDetailViewProps = {
  base: string;
  candidate: Tables<"candidates">;
  applications: CandidateApplicationRow[];
  /** Mutating controls (add-to-job dialog); omitted in read-only contexts. */
  actions?: React.ReactNode;
  /** Per-application remove control; omitted in read-only contexts. */
  renderRemove?: (application: CandidateApplicationRow) => React.ReactNode;
  /** Delete control; omitted in read-only contexts. */
  dangerZone?: React.ReactNode;
};

export function CandidateDetailView({
  base,
  candidate,
  applications,
  actions,
  renderRemove,
  dangerZone,
}: CandidateDetailViewProps) {
  const facts: Array<[string, React.ReactNode]> = [
    ["Email", candidate.email ?? "—"],
    ["Phone", candidate.phone ?? "—"],
    ["Location", candidate.location ?? "—"],
    [
      "LinkedIn",
      candidate.linkedin_url ? (
        <ExternalLink href={candidate.linkedin_url}>Profile provided — manual review</ExternalLink>
      ) : (
        "—"
      ),
    ],
    [
      "GitHub",
      candidate.github_url ? (
        <ExternalLink href={candidate.github_url}>{candidate.github_url}</ExternalLink>
      ) : (
        "—"
      ),
    ],
    ["Added", formatDateTime(candidate.created_at)],
  ];

  return (
    <FadeIn>
      <PageHeader
        title={candidate.full_name}
        description={candidate.headline ?? undefined}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`${base}/candidates/${candidate.id}/edit`}>
                <Pencil aria-hidden="true" />
                Edit
              </Link>
            </Button>
            {actions}
          </>
        }
      />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <div className="min-w-0 space-y-8">
          <section>
            <h2 className="mb-3 text-lg font-semibold">Applications</h2>
            {applications.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                Not in any pipeline yet. Use &quot;Add to job&quot; to start one.
              </p>
            ) : (
              <div className="rounded-lg border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead>Stage since</TableHead>
                      {renderRemove ? <TableHead className="w-0" /> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {applications.map((application) => (
                      <TableRow key={application.id}>
                        <TableCell>
                          <Link
                            href={`${base}/jobs/${application.job.id}`}
                            className="font-medium underline-offset-4 hover:underline"
                          >
                            {application.job.title}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <StageBadge stage={application.stage} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDateTime(application.stage_changed_at)}
                        </TableCell>
                        {renderRemove ? <TableCell>{renderRemove(application)}</TableCell> : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
          <section>
            <h2 className="mb-3 text-lg font-semibold">Notes</h2>
            {candidate.notes ? (
              <p className="rounded-lg border bg-card p-5 text-sm whitespace-pre-wrap">
                {candidate.notes}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">No notes.</p>
            )}
          </section>
        </div>
        <aside className="min-w-0 space-y-6">
          <section className="rounded-lg border bg-card p-5">
            <h2 className="text-sm font-semibold">Profile</h2>
            <dl className="mt-3 space-y-3 text-sm">
              {facts.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="break-words">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
          {dangerZone ? (
            <section className="rounded-lg border bg-card p-5">
              <h2 className="text-sm font-semibold">Danger zone</h2>
              <p className="mt-1 mb-3 text-sm text-muted-foreground">
                Deleting removes the candidate, their applications and any insights.
              </p>
              {dangerZone}
            </section>
          ) : null}
        </aside>
      </div>
    </FadeIn>
  );
}
