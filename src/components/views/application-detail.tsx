import { Briefcase, UserRound } from "lucide-react";
import Link from "next/link";
import { InsightsPanel } from "@/components/insights/insights-panel";
import { FadeIn } from "@/components/motion/fade-in";
import { formatDateTime, PageHeader } from "@/components/page-header";
import { StageBadge } from "@/components/stage-badge";
import { Button } from "@/components/ui/button";
import type { ApplicationDetail, InsightView } from "@/server/data/insights";

type ApplicationDetailViewProps = {
  base: string;
  orgSlug: string;
  application: ApplicationDetail;
  insight: InsightView | null;
  aiConfigured: boolean;
};

const JOB_STATUS_LABEL: Record<ApplicationDetail["job"]["status"], string> = {
  draft: "Draft",
  open: "Open",
  closed: "Closed",
};

/** Application detail: one candidate in one job's pipeline, with the Candidate Insights panel. */
export function ApplicationDetailView({
  base,
  orgSlug,
  application,
  insight,
  aiConfigured,
}: ApplicationDetailViewProps) {
  const candidateHref = `${base}/candidates/${application.candidate.id}`;
  const jobHref = `${base}/jobs/${application.job.id}`;

  const facts: Array<[string, React.ReactNode]> = [
    ["Stage", <StageBadge key="stage" stage={application.stage} />],
    ["Stage since", formatDateTime(application.stageChangedAt)],
    ["Added to pipeline", formatDateTime(application.createdAt)],
    ["Job status", JOB_STATUS_LABEL[application.job.status]],
  ];

  return (
    <FadeIn>
      <PageHeader
        title={application.candidate.fullName}
        description={`Application for ${application.job.title}${
          application.candidate.headline ? ` · ${application.candidate.headline}` : ""
        }`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={candidateHref}>
                <UserRound aria-hidden="true" />
                Candidate
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={jobHref}>
                <Briefcase aria-hidden="true" />
                Job
              </Link>
            </Button>
          </>
        }
      />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <div className="min-w-0">
          <InsightsPanel
            orgSlug={orgSlug}
            applicationId={application.id}
            initial={insight}
            cvPresent={application.candidate.cvPresent}
            aiAuthorized={application.candidate.aiAuthorized}
            aiConfigured={aiConfigured}
            candidateHref={candidateHref}
          />
        </div>
        <aside className="min-w-0 space-y-6">
          <section className="rounded-lg border bg-card p-5">
            <h2 className="text-sm font-semibold">Application</h2>
            <dl className="mt-3 space-y-3 text-sm">
              {facts.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="break-words">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="rounded-lg border bg-card p-5">
            <h2 className="text-sm font-semibold">CV and AI authorization</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">CV</dt>
                <dd>{application.candidate.cvPresent ? "Uploaded" : "Not uploaded"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">AI analysis of the CV</dt>
                <dd>
                  {application.candidate.aiAuthorized
                    ? `Authorized${
                        application.candidate.aiAuthorizedAt
                          ? ` ${formatDateTime(application.candidate.aiAuthorizedAt)}`
                          : ""
                      }`
                    : "Not authorized"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">GitHub evidence</dt>
                <dd>
                  {!application.candidate.githubUrl
                    ? "No profile URL provided"
                    : application.candidate.githubAiAuthorized
                      ? `Authorized${
                          application.candidate.githubAiAuthorizedAt
                            ? ` ${formatDateTime(application.candidate.githubAiAuthorizedAt)}`
                            : ""
                        }`
                      : "Profile provided, not authorized"}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              Both authorizations are recorded and revoked on the candidate page. Revoking the CV
              authorization removes every generated insight; revoking the GitHub authorization
              removes the insights that used GitHub evidence. LinkedIn is a manual-review link only
              and is never analysed.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link href={candidateHref}>Manage on candidate page</Link>
            </Button>
          </section>
        </aside>
      </div>
    </FadeIn>
  );
}
