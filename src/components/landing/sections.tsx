import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  KeyRound,
  Layers,
  ScrollText,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";
import { cn } from "cn";
import { AdminContextBanner } from "@/components/admin-context-banner";
import { LogoMark } from "@/components/landing/logo";
import { LANDING_SECTIONS } from "@/components/landing/sections-data";
import { HeroItem, HeroStagger, Reveal } from "@/components/landing/motion";
import { ProductShowcase } from "@/components/landing/product-showcase";
import { StageBadge } from "@/components/stage-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const CONTAINER = "mx-auto w-full max-w-6xl px-4 sm:px-6";

/* ------------------------------------------------------------------ hero */

export function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="relative overflow-hidden pt-32 pb-16 sm:pt-40 sm:pb-24">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[640px] opacity-80 motion-safe:animate-[landing-drift_14s_ease-in-out_infinite]"
        style={{
          background:
            "radial-gradient(50% 45% at 50% 0%, var(--landing-glow-blue), transparent 70%), radial-gradient(35% 35% at 80% 20%, var(--landing-glow-violet), transparent 70%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,#ffffff0a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0a_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(60%_50%_at_50%_0%,#000_30%,transparent_100%)]"
      />
      <div className={cn(CONTAINER, "text-center")}>
        <HeroStagger className="mx-auto max-w-3xl">
          <HeroItem>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
              Applicant tracking for recruiting teams
            </span>
          </HeroItem>
          <HeroItem>
            <h1 className="mt-6 text-5xl font-semibold tracking-[-0.035em] text-balance sm:text-6xl lg:text-7xl lg:leading-[1.02]">
              Hire with clarity. <span className="landing-gradient-text">Move talent forward.</span>
            </h1>
          </HeroItem>
          <HeroItem>
            <p className="mx-auto mt-6 max-w-xl text-lg text-pretty text-muted-foreground sm:text-xl">
              TalentFlow is a multi-tenant applicant tracking system: post jobs, keep every
              candidate in one place, and move applications through a compact pipeline your whole
              team can read at a glance.
            </p>
          </HeroItem>
          <HeroItem>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-11 px-5 text-base">
                <Link href={signedIn ? "/app" : "/login"}>
                  {signedIn ? "Open app" : "Sign in"}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-11 border-white/15 bg-white/5 px-5 text-base hover:bg-white/10"
              >
                <a href="#product">See the product</a>
              </Button>
            </div>
          </HeroItem>
          <HeroItem>
            <p className="mt-4 text-sm text-muted-foreground">
              Accounts are created by invitation from your platform administrator.
            </p>
          </HeroItem>
        </HeroStagger>
      </div>
      <div id="product" className={cn(CONTAINER, "mt-16 scroll-mt-24 sm:mt-20")}>
        <Reveal scale delay={0.15}>
          <ProductShowcase />
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- facts strip */

const FACTS = [
  { icon: ShieldCheck, text: "Tenant isolation enforced in PostgreSQL with row level security" },
  { icon: Layers, text: "One candidate, many pipelines: applications link people to jobs" },
  {
    icon: KeyRound,
    text: "Invitation-based onboarding, platform admins act with their own identity",
  },
  { icon: BadgeCheck, text: "Keyboard-accessible board, reduced-motion aware, WCAG 2.2 targets" },
];

export function FactsStrip() {
  return (
    <section aria-label="Product principles" className="border-y border-white/10 bg-white/[0.02]">
      <div className={cn(CONTAINER, "grid gap-6 py-8 sm:grid-cols-2 lg:grid-cols-4")}>
        {FACTS.map((fact) => (
          <Reveal key={fact.text} className="flex items-start gap-3">
            <fact.icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <p className="text-sm text-pretty text-muted-foreground">{fact.text}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ feature story */

type FeatureProps = {
  id: string;
  eyebrow: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  title: string;
  description: string;
  bullets: string[];
  visual: React.ReactNode;
  reverse?: boolean;
};

function Feature({
  id,
  eyebrow,
  icon: Icon,
  title,
  description,
  bullets,
  visual,
  reverse,
}: FeatureProps) {
  return (
    <section id={id} className="scroll-mt-24 py-16 sm:py-24">
      <div
        className={cn(
          CONTAINER,
          "grid items-center gap-10 lg:grid-cols-2 lg:gap-16",
          reverse && "lg:[&>*:first-child]:order-2",
        )}
      >
        <Reveal>
          <p className="inline-flex items-center gap-2 text-sm font-medium text-primary">
            <Icon className="size-4" aria-hidden="true" />
            {eyebrow}
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.025em] text-balance sm:text-4xl">
            {title}
          </h2>
          <p className="mt-4 text-lg text-pretty text-muted-foreground">{description}</p>
          <ul className="mt-6 space-y-3">
            {bullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-3 text-sm text-foreground/90">
                <span
                  className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
                  aria-hidden="true"
                />
                {bullet}
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={0.1}>{visual}</Reveal>
      </div>
    </section>
  );
}

function Frame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-white/10 bg-card p-4 shadow-[0_30px_80px_-40px_rgba(109,140,255,0.35)] ring-1 ring-white/5 sm:p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

const JOB_ROWS = [
  { title: "Senior Backend Engineer", status: "Open", count: 5, location: "Oslo · Hybrid" },
  { title: "Product Designer", status: "Open", count: 4, location: "Remote (Europe)" },
  { title: "Customer Success Manager", status: "Open", count: 3, location: "Bergen" },
  { title: "Data Analyst (contract)", status: "Closed", count: 2, location: "Oslo" },
];

function JobsVisual() {
  return (
    <Frame aria-hidden="true">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">Jobs</p>
        <span className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">
          Post job
        </span>
      </div>
      <ul className="divide-y divide-white/10 overflow-hidden rounded-lg border border-white/10">
        {JOB_ROWS.map((job) => (
          <li key={job.title} className="flex items-center gap-3 px-3 py-2.5 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{job.title}</span>
              <span className="block truncate text-xs text-muted-foreground">{job.location}</span>
            </span>
            <Badge variant={job.status === "Open" ? "secondary" : "outline"}>{job.status}</Badge>
            <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
              {job.count}
            </span>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

function CandidatesVisual() {
  return (
    <Frame aria-hidden="true">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold">Ada Example</p>
          <p className="text-sm text-muted-foreground">
            Senior backend engineer, Go and TypeScript
          </p>
        </div>
        <span className="rounded-md border border-white/10 px-2 py-1 text-xs text-muted-foreground">
          Profile provided — manual review
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Email</dt>
          <dd>ada@example.test</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Location</dt>
          <dd>Oslo</dd>
        </div>
      </dl>
      <p className="mt-5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Applications
      </p>
      <ul className="mt-2 space-y-2">
        <li className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm">
          <span>Senior Backend Engineer</span>
          <StageBadge stage="interview" />
        </li>
        <li className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm">
          <span>Product Designer</span>
          <StageBadge stage="screening" />
        </li>
      </ul>
    </Frame>
  );
}

const AUDIT_ROWS = [
  { action: "admin.context_entered", actor: "admin@example.test", org: "Northwind Hiring" },
  { action: "user.invited", actor: "admin@example.test", org: "Northwind Hiring" },
  { action: "organization.created", actor: "admin@example.test", org: "Fjord Logistics" },
];

function CollaborationVisual() {
  return (
    <Frame className="p-0 sm:p-0" aria-hidden="true">
      <AdminContextBanner organizationName="Northwind Hiring" />
      <div className="p-4 sm:p-5">
        <p className="text-sm font-semibold">Audit log</p>
        <ul className="mt-3 divide-y divide-white/10 rounded-lg border border-white/10">
          {AUDIT_ROWS.map((row) => (
            <li
              key={row.action}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
            >
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{row.action}</code>
              <span className="text-muted-foreground">{row.actor}</span>
              <span className="ml-auto text-xs text-muted-foreground">{row.org}</span>
            </li>
          ))}
        </ul>
      </div>
    </Frame>
  );
}

export function FeatureStory() {
  return (
    <>
      <Feature
        id="jobs"
        eyebrow="Jobs"
        icon={Briefcase}
        title="Post once. See the whole pipeline."
        description="Every job carries its own pipeline. Open, draft or closed, the state is explicit and the application count is one click from the board."
        bullets={[
          "Title, description, location, employment type and status, validated inline",
          "Jump from any job straight to its filtered pipeline",
          "Closed jobs keep their history and stop accepting new candidates",
        ]}
        visual={<JobsVisual />}
      />
      <Feature
        id="candidates"
        eyebrow="Candidate tracking"
        icon={UserRound}
        title="One person. Many pipelines. No duplicates."
        description="Candidates are people, applications link them to jobs. The same engineer can be in screening for one role and at offer for another without a second record."
        bullets={[
          "Profile, notes, phone and e-mail in one place",
          "LinkedIn and GitHub links stored for manual review, never scraped",
          "Search by name, filter the board by job, combine both",
        ]}
        visual={<CandidatesVisual />}
        reverse
      />
      <Feature
        id="collaboration"
        eyebrow="Collaboration"
        icon={Users}
        title="Clear roles, clear boundaries."
        description="Each customer is an isolated workspace. Platform admins can step in to help, with their own identity and an audit trail, never by impersonating a user."
        bullets={[
          "Invitation links instead of e-mailed passwords",
          "Admin access inside a workspace is visible and logged",
          "Row level security in the database is the final authority on every query",
        ]}
        visual={<CollaborationVisual />}
      />
    </>
  );
}

/* --------------------------------------------------------------- AI section */

const AI_GROUPS: Array<{ label: string; tone: string; items: string[] }> = [
  {
    label: "Supported",
    tone: "border-emerald-400/30 text-emerald-200",
    items: [
      "Five years of Go services, cited from the CV",
      "Maintains an open-source PostgreSQL tool",
    ],
  },
  {
    label: "Uncertain",
    tone: "border-amber-400/30 text-amber-200",
    items: ["Team leadership: mentioned without scope"],
  },
  {
    label: "Not provided",
    tone: "border-white/15 text-muted-foreground",
    items: ["Experience with Azure"],
  },
];

export function AiSection() {
  return (
    <section
      id="ai"
      className="scroll-mt-24 border-y border-white/10 bg-white/[0.02] py-16 sm:py-24"
    >
      <div className={cn(CONTAINER, "grid items-center gap-10 lg:grid-cols-2 lg:gap-16")}>
        <Reveal>
          <p className="inline-flex items-center gap-2 text-sm font-medium text-primary">
            <Sparkles className="size-4" aria-hidden="true" />
            AI Candidate Insights
            <Badge variant="outline" className="border-white/20 text-foreground/80">
              In development
            </Badge>
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.025em] text-balance sm:text-4xl">
            Evidence first. Humans decide.
          </h2>
          <p className="mt-4 text-lg text-pretty text-muted-foreground">
            We are building an advisory summary that compares what a candidate actually provided
            with what a job asks for. It is not available yet, and this is how it will work.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-foreground/90">
            {[
              "Every finding cites its source: CV text, a public GitHub repository, or the profile",
              "Findings are grouped as supported, uncertain, or not provided",
              "No ranking, no scoring, no automatic rejection; a reviewer confirms or deletes it",
              "Public GitHub data only through the official API; LinkedIn is never scraped",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span
                  className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
                  aria-hidden="true"
                />
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-muted-foreground">
            Shown as a design illustration. The feature ships only after the core product is
            verified.
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <Frame aria-hidden="true">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Insights for Senior Backend Engineer</p>
              <span className="rounded-md border border-dashed border-white/20 px-2 py-1 text-xs text-muted-foreground">
                Illustration
              </span>
            </div>
            <div className="mt-4 space-y-4">
              {AI_GROUPS.map((group) => (
                <div key={group.label}>
                  <p
                    className={cn(
                      "inline-block rounded-md border px-2 py-0.5 text-xs font-medium",
                      group.tone,
                    )}
                  >
                    {group.label}
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {group.items.map((item) => (
                      <li
                        key={item}
                        className="rounded-lg border border-white/10 px-3 py-2 text-sm"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Human review required · sources listed with every finding
            </p>
          </Frame>
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- CTA + footer */

export function CtaSection({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="py-20 sm:py-28">
      <div className={cn(CONTAINER)}>
        <Reveal>
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-card px-6 py-14 text-center sm:px-12">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-60"
              style={{
                background:
                  "radial-gradient(45% 60% at 50% 100%, var(--landing-glow-violet), transparent 70%), radial-gradient(40% 50% at 20% 0%, var(--landing-glow-blue), transparent 70%)",
              }}
            />
            <h2 className="relative text-3xl font-semibold tracking-[-0.025em] text-balance sm:text-4xl">
              Ready when your team is.
            </h2>
            <p className="relative mx-auto mt-4 max-w-xl text-pretty text-muted-foreground">
              {signedIn
                ? "Your workspace is one click away."
                : "Already invited? Sign in with the password you set. Need access? Ask your TalentFlow platform administrator for an invitation link."}
            </p>
            <div className="relative mt-8 flex justify-center">
              <Button asChild size="lg" className="h-11 px-5 text-base">
                <Link href={signedIn ? "/app" : "/login"}>
                  {signedIn ? "Open app" : "Sign in"}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="border-t border-white/10 py-10">
      <div
        className={cn(
          CONTAINER,
          "flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between",
        )}
      >
        <div className="max-w-sm">
          <p className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            <LogoMark id="tf-mark-footer" />
            TalentFlow
          </p>
          <p className="mt-3 text-sm text-pretty text-muted-foreground">
            Multi-tenant applicant tracking built on Next.js and Supabase. Jobs, candidates and a
            compact pipeline for recruiting teams.
          </p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-8 text-sm sm:gap-12">
          <div>
            <p className="font-medium">Product</p>
            <ul className="mt-3 space-y-2">
              {LANDING_SECTIONS.map((section) => (
                <li key={section.href}>
                  <a href={section.href} className="text-muted-foreground hover:text-foreground">
                    {section.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-medium">Account</p>
            <ul className="mt-3 space-y-2">
              <li>
                <Link href="/login" className="text-muted-foreground hover:text-foreground">
                  Sign in
                </Link>
              </li>
              <li>
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <ScrollText className="size-3.5" aria-hidden="true" />
                  Invitation-based onboarding
                </span>
              </li>
            </ul>
          </div>
        </nav>
      </div>
      <div
        className={cn(
          CONTAINER,
          "mt-10 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:justify-between",
        )}
      >
        <p>© 2026 TalentFlow. All rights reserved.</p>
        <p>AI Candidate Insights is in development and not yet available.</p>
      </div>
    </footer>
  );
}
