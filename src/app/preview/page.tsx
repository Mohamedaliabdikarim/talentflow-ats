import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FadeIn } from "@/components/motion/fade-in";
import { PREVIEW_BASE } from "@/preview/enabled";

export const metadata: Metadata = { title: "Local preview" };

const LINKS: Array<{ group: string; items: Array<{ href: string; label: string; note: string }> }> =
  [
    {
      group: "Customer workspace (Northwind Hiring)",
      items: [
        { href: PREVIEW_BASE, label: "Dashboard", note: "Workspace overview with live counts" },
        { href: `${PREVIEW_BASE}/jobs`, label: "Jobs", note: "List, detail, edit form" },
        {
          href: `${PREVIEW_BASE}/candidates`,
          label: "Candidates",
          note: "List with name search, detail, forms",
        },
        {
          href: `${PREVIEW_BASE}/pipeline`,
          label: "Kanban pipeline",
          note: "Move cards by menu or drag; filter by job and name",
        },
        { href: `${PREVIEW_BASE}/members`, label: "Members", note: "Workspace members" },
      ],
    },
    {
      group: "Platform admin",
      items: [
        { href: "/preview/admin", label: "Admin overview", note: "Counts and recent audit events" },
        { href: "/preview/admin/organizations", label: "Organizations", note: "Customer list" },
        { href: "/preview/admin/audit", label: "Audit log", note: "Security-relevant actions" },
      ],
    },
    {
      group: "Public pages (real)",
      items: [{ href: "/login", label: "Sign in", note: "The real login page" }],
    },
  ];

export default function PreviewIndexPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-3xl px-4 py-10">
      <FadeIn>
        <p className="text-sm font-semibold tracking-tight text-primary">TalentFlow</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Local preview</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Every page below is rendered by the same components as the real application, fed with
          synthetic data. Nothing here touches Supabase.
        </p>
        <div className="mt-8 space-y-8">
          {LINKS.map((section) => (
            <section key={section.group}>
              <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase">
                {section.group}
              </h2>
              <ul className="divide-y rounded-lg border bg-card">
                {section.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-accent/50"
                    >
                      <span>
                        <span className="block text-sm font-medium">{item.label}</span>
                        <span className="block text-xs text-muted-foreground">{item.note}</span>
                      </span>
                      <ArrowRight
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </FadeIn>
    </main>
  );
}
