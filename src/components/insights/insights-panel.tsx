"use client";

import {
  CircleCheck,
  CircleDashed,
  CircleQuestionMark,
  LoaderCircle,
  type LucideIcon,
  MessageCircleQuestionMark,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { formatDateTime } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ADVISORY_NOTICE,
  ASSESSMENT_STATUS_HELP,
  ASSESSMENT_STATUS_LABELS,
  ASSESSMENT_STATUSES,
  type AssessmentStatus,
  type JobMatchResult,
} from "@/lib/ai/insights-contract";
import type { InsightView } from "@/server/data/insights";
import {
  generateApplicationInsightsAction,
  getApplicationInsightAction,
} from "@/server/actions/insights";

/**
 * Candidate Insights panel (ADR-035). States: not configured, CV missing, authorization required,
 * none yet, pending/analyzing (polls), ready, failed (retry), revoked. Every status is conveyed by
 * icon + text, never colour alone; the advisory notice is always visible with a result.
 */

const POLL_INTERVAL_MS = 3_000;
/** ~5 minutes of polling, then the panel asks the user to check again explicitly. */
const MAX_POLLS = 100;

type Props = {
  orgSlug: string;
  applicationId: string;
  initial: InsightView | null;
  cvPresent: boolean;
  aiAuthorized: boolean;
  aiConfigured: boolean;
  candidateHref: string;
};

const STATUS_PRESENTATION: Record<AssessmentStatus, { icon: LucideIcon; tone: string }> = {
  supported: {
    icon: CircleCheck,
    tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100",
  },
  needs_verification: {
    icon: CircleQuestionMark,
    tone: "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100",
  },
  not_evidenced: {
    icon: CircleDashed,
    tone: "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-100",
  },
};

function AssessmentStatusChip({ status }: { status: AssessmentStatus }) {
  const { icon: Icon, tone } = STATUS_PRESENTATION[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
        tone,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {ASSESSMENT_STATUS_LABELS[status]}
    </span>
  );
}

function isActive(status: InsightView["status"]): boolean {
  return status === "pending" || status === "analyzing";
}

export function InsightsPanel({
  orgSlug,
  applicationId,
  initial,
  cvPresent,
  aiAuthorized,
  aiConfigured,
  candidateHref,
}: Props) {
  const [insight, setInsight] = useState<InsightView | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [polls, setPolls] = useState(0);
  const [isPending, startTransition] = useTransition();
  const headingId = useId();

  const refresh = useCallback(async () => {
    const result = await getApplicationInsightAction(orgSlug, applicationId);
    if (result.status === "success") setInsight(result.data);
    return result;
  }, [orgSlug, applicationId]);

  // Poll while a run is in progress; stop at a terminal status or after MAX_POLLS.
  const activeId = insight && isActive(insight.status) ? insight.id : null;
  useEffect(() => {
    if (!activeId || polls >= MAX_POLLS) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      const result = await getApplicationInsightAction(orgSlug, applicationId);
      if (cancelled) return;
      if (result.status === "success") setInsight(result.data);
      setPolls((count) => count + 1);
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeId, polls, orgSlug, applicationId]);

  const generate = () => {
    startTransition(async () => {
      setError(null);
      const result = await generateApplicationInsightsAction(orgSlug, applicationId);
      if (result.status === "error") {
        setError(result.message);
        toast.error(result.message);
        return;
      }
      toast.success((result.status === "success" && result.message) || "Analysis started.");
      setPolls(0);
      await refresh();
    });
  };

  const canGenerate = aiConfigured && cvPresent && aiAuthorized;

  return (
    <section
      aria-labelledby={headingId}
      aria-busy={activeId !== null}
      className="rounded-lg border bg-card"
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-border/70 px-5 py-4">
        <Sparkles className="size-5 text-primary" aria-hidden="true" />
        <h2 id={headingId} className="text-base font-semibold tracking-tight">
          Candidate Insights
        </h2>
        <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
          AI · advisory
        </span>
        {insight?.status === "ready" && canGenerate ? (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={generate}
            disabled={isPending}
          >
            <RefreshCw className={cn(isPending && "animate-spin")} aria-hidden="true" />
            Regenerate
          </Button>
        ) : null}
      </header>

      <div className="space-y-4 p-5">
        <p aria-live="polite" className="sr-only">
          {activeId ? "Analysis in progress." : insight ? `Analysis ${insight.status}.` : ""}
        </p>

        {error ? (
          <Alert variant="destructive" role="alert">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>Could not start the analysis</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {!aiConfigured ? (
          <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            AI insights are not configured for this environment. Nothing is analysed and no AI
            output is shown.
          </p>
        ) : !cvPresent ? (
          <Gate
            title="No CV to analyse"
            description="Upload the candidate's CV and record their AI authorization on the candidate page. Insights are generated only from an authorized CV."
            href={candidateHref}
            linkLabel="Open candidate"
          />
        ) : !aiAuthorized ? (
          <Gate
            title="AI authorization required"
            description={
              insight?.status === "revoked"
                ? "AI authorization was withdrawn and the previous insights were removed. Record a new authorization on the candidate page to analyse again."
                : "The candidate has not authorized AI analysis of their CV. Record the authorization on the candidate page; it is never assumed."
            }
            href={candidateHref}
            linkLabel="Manage authorization"
          />
        ) : !insight || insight.status === "superseded" ? (
          <EmptyInsights onGenerate={generate} busy={isPending} />
        ) : isActive(insight.status) ? (
          <Analyzing
            attempt={insight.attemptCount}
            exhausted={polls >= MAX_POLLS}
            onCheck={() => {
              setPolls(0);
              void refresh();
            }}
          />
        ) : insight.status === "failed" ? (
          <Failed
            message={insight.errorMessage}
            attempt={insight.attemptCount}
            onRetry={generate}
            busy={isPending}
          />
        ) : insight.status === "revoked" ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {insight.errorMessage ??
                "The insights were removed when authorization was withdrawn."}
            </p>
            <Button onClick={generate} disabled={isPending}>
              <Sparkles aria-hidden="true" />
              Generate insights
            </Button>
          </div>
        ) : insight.result ? (
          <ReadyResult
            result={insight.result}
            generatedAt={insight.generatedAt}
            model={insight.modelVersion}
            contract={insight.contractVersion}
          />
        ) : (
          <EmptyInsights onGenerate={generate} busy={isPending} />
        )}
      </div>
    </section>
  );
}

function Gate({
  title,
  description,
  href,
  linkLabel,
}: {
  title: string;
  description: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-dashed p-5">
      <p className="flex items-center gap-2 text-sm font-medium">
        <ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" />
        {title}
      </p>
      <p className="text-sm text-muted-foreground">{description}</p>
      <Button asChild variant="outline" size="sm">
        <Link href={href}>{linkLabel}</Link>
      </Button>
    </div>
  );
}

function EmptyInsights({ onGenerate, busy }: { onGenerate: () => void; busy: boolean }) {
  return (
    <div className="space-y-3 rounded-lg border border-dashed p-5">
      <p className="text-sm font-medium">No insights yet</p>
      <p className="text-sm text-muted-foreground">
        Analyse the authorized CV against this job&apos;s requirements. The result is advisory,
        evidence-based and reviewed by you; it never scores or decides.
      </p>
      <Button onClick={onGenerate} disabled={busy}>
        {busy ? (
          <LoaderCircle className="animate-spin" aria-hidden="true" />
        ) : (
          <Sparkles aria-hidden="true" />
        )}
        {busy ? "Starting…" : "Generate insights"}
      </Button>
    </div>
  );
}

function Analyzing({
  attempt,
  exhausted,
  onCheck,
}: {
  attempt: number;
  exhausted: boolean;
  onCheck: () => void;
}) {
  return (
    <div className="space-y-4" role="status">
      <p className="flex items-center gap-2 text-sm font-medium">
        <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden="true" />
        Analysing the CV against this job…
        {attempt > 1 ? (
          <span className="text-xs font-normal text-muted-foreground">(attempt {attempt})</span>
        ) : null}
      </p>
      <div className="space-y-2" aria-hidden="true">
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      {exhausted ? (
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>This is taking longer than usual.</span>
          <Button variant="outline" size="sm" onClick={onCheck}>
            Check again
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          This usually takes under a minute. You can leave this page; the result is saved.
        </p>
      )}
    </div>
  );
}

function Failed({
  message,
  attempt,
  onRetry,
  busy,
}: {
  message: string | null;
  attempt: number;
  onRetry: () => void;
  busy: boolean;
}) {
  return (
    <div className="space-y-3">
      <Alert variant="destructive" role="alert">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>Analysis failed</AlertTitle>
        <AlertDescription>
          {message ?? "The analysis could not be completed."}
          {attempt > 1 ? ` (${attempt} attempts)` : ""}
        </AlertDescription>
      </Alert>
      <Button onClick={onRetry} disabled={busy} variant="outline">
        <RefreshCw className={cn(busy && "animate-spin")} aria-hidden="true" />
        Retry
      </Button>
    </div>
  );
}

function ReadyResult({
  result,
  generatedAt,
  model,
  contract,
}: {
  result: JobMatchResult;
  generatedAt: string | null;
  model: string | null;
  contract: string | null;
}) {
  return (
    <div className="space-y-6">
      <Alert>
        <ShieldCheck aria-hidden="true" />
        <AlertTitle>Advisory only — a person decides</AlertTitle>
        <AlertDescription>{ADVISORY_NOTICE}</AlertDescription>
      </Alert>

      <div>
        <h3 className="text-sm font-semibold">Summary</h3>
        <p className="mt-1.5 text-sm leading-relaxed">{result.summary}</p>
      </div>

      <div>
        <h3 className="text-sm font-semibold">Job requirements</h3>
        <ul
          className="mt-2 divide-y divide-border/70 rounded-lg border"
          aria-label="Requirement assessments"
        >
          {result.assessments.map((assessment, index) => (
            <li key={index} className="space-y-1.5 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-medium">{assessment.requirement}</p>
                <AssessmentStatusChip status={assessment.status} />
              </div>
              <p className="text-sm text-muted-foreground">{assessment.evidence}</p>
            </li>
          ))}
        </ul>
        <dl className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
          {ASSESSMENT_STATUSES.map((status) => (
            <div key={status} className="space-y-1">
              <dt>
                <AssessmentStatusChip status={status} />
              </dt>
              <dd>{ASSESSMENT_STATUS_HELP[status]}</dd>
            </div>
          ))}
        </dl>
      </div>

      {result.interview_questions.length > 0 ? (
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <MessageCircleQuestionMark
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
            Suggested interview questions
          </h3>
          <ol
            className="mt-2 list-decimal space-y-1.5 pl-5 text-sm"
            aria-label="Suggested interview questions"
          >
            {result.interview_questions.map((question, index) => (
              <li key={index}>{question}</li>
            ))}
          </ol>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Generated {generatedAt ? formatDateTime(generatedAt) : "—"}
        {model ? ` · model ${model}` : ""}
        {contract ? ` · contract ${contract}` : ""}. Based only on the authorized CV and this
        job&apos;s description.
      </p>
    </div>
  );
}
