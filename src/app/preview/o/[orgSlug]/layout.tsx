import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import type { NavItem } from "@/components/nav-link";
import { PREVIEW_ORGANIZATION, PREVIEW_USER } from "@/preview/demo-data";
import { PREVIEW_BASE, PREVIEW_ORG_SLUG } from "@/preview/enabled";

export default async function PreviewWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  if (orgSlug !== PREVIEW_ORG_SLUG) notFound();

  const nav: NavItem[] = [
    { href: PREVIEW_BASE, label: "Overview", icon: "dashboard", exact: true },
    { href: `${PREVIEW_BASE}/jobs`, label: "Jobs", icon: "jobs" },
    { href: `${PREVIEW_BASE}/candidates`, label: "Candidates", icon: "candidates" },
    { href: `${PREVIEW_BASE}/pipeline`, label: "Pipeline", icon: "pipeline" },
    { href: `${PREVIEW_BASE}/members`, label: "Members", icon: "members" },
  ];

  return (
    <AppShell
      theme="app"
      title={PREVIEW_ORGANIZATION.name}
      subtitle="Your role: owner (preview)"
      items={nav}
      userEmail={PREVIEW_USER.email}
      signOut={false}
    >
      {children}
    </AppShell>
  );
}
