import { AppShell } from "@/components/app-shell";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { showcaseMoveAction } from "@/components/landing/actions";
import type { NavItem } from "@/components/nav-link";
import { PageHeader } from "@/components/page-header";
import { demoCardsSnapshot } from "@/preview/store";

const NAV: NavItem[] = [
  { href: "#", label: "Overview", icon: "dashboard" },
  { href: "#", label: "Jobs", icon: "jobs" },
  { href: "#", label: "Candidates", icon: "candidates" },
  { href: "#pipeline", label: "Pipeline", icon: "pipeline", exact: true },
  { href: "#", label: "Members", icon: "members" },
];

/**
 * The real application shell and Kanban board, rendered with synthetic data in the
 * landing palette. `inert` + aria-hidden keep it a picture for keyboards and assistive
 * technology: nothing inside is focusable or announced.
 */
export function ProductShowcase() {
  const { cards, generatedAt } = demoCardsSnapshot();
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-10 -top-24 h-72 rounded-full opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(60% 60% at 30% 50%, var(--landing-glow-blue), transparent 70%), radial-gradient(50% 50% at 75% 40%, var(--landing-glow-violet), transparent 70%)",
        }}
      />
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-card shadow-[0_40px_120px_-40px_rgba(109,140,255,0.45)] ring-1 ring-white/5">
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-2.5">
          <span className="flex gap-1.5" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-white/15" />
            <span className="size-2.5 rounded-full bg-white/15" />
            <span className="size-2.5 rounded-full bg-white/15" />
          </span>
          <span className="truncate rounded-md bg-white/5 px-3 py-1 font-mono text-[11px] text-muted-foreground">
            TalentFlow · Northwind Hiring · Pipeline
          </span>
        </div>
        <div
          inert
          aria-hidden="true"
          className="h-[400px] overflow-hidden text-left select-none sm:h-[480px] lg:h-[540px] [&_*]:pointer-events-none"
        >
          <AppShell
            title="Northwind Hiring"
            subtitle="Your role: owner"
            items={NAV}
            userEmail="you@example.test"
            signOut={false}
          >
            <PageHeader
              title="Pipeline"
              description="All applications across jobs, grouped by stage."
            />
            <KanbanBoard
              orgSlug="northwind"
              basePath="#"
              cards={cards}
              now={generatedAt}
              moveAction={showcaseMoveAction}
            />
          </AppShell>
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-card to-transparent"
        />
      </div>
    </div>
  );
}
