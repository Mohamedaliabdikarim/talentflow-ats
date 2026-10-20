import { after } from "next/server";
import { AdminContextBanner } from "@/components/admin-context-banner";
import { AppShell } from "@/components/app-shell";
import type { NavItem } from "@/components/nav-link";
import { PermissionDenied } from "@/components/permission-denied";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrganizationContext, requireUser } from "@/server/auth";
import { recordAdminContextEntry } from "@/server/data/workspace";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const user = await requireUser(`/o/${orgSlug}`);
  const organization = await getOrganizationContext(orgSlug);
  if (!organization) {
    return <PermissionDenied />;
  }
  if (organization.actingAsAdmin) {
    // Audited after the response is sent, so the lookup and write never delay navigation
    // (ADR-042). The client is created here because request APIs are unavailable in after().
    const supabase = await createServerSupabase();
    after(() =>
      recordAdminContextEntry(supabase, user.id, organization.id).catch((error: unknown) => {
        console.error(
          `[audit] admin context entry failed: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }),
    );
  }

  const base = `/o/${organization.slug}`;
  const nav: NavItem[] = [
    { href: base, label: "Overview", icon: "dashboard", exact: true },
    { href: `${base}/jobs`, label: "Jobs", icon: "jobs" },
    { href: `${base}/candidates`, label: "Candidates", icon: "candidates" },
    { href: `${base}/pipeline`, label: "Pipeline", icon: "pipeline" },
    { href: `${base}/members`, label: "Members", icon: "members" },
  ];

  return (
    <AppShell
      theme="app"
      title={organization.name}
      subtitle={
        organization.actingAsAdmin ? "Platform admin access" : `Your role: ${organization.role}`
      }
      items={nav}
      userEmail={user.email}
      banner={
        organization.actingAsAdmin ? (
          <AdminContextBanner organizationName={organization.name} />
        ) : undefined
      }
    >
      {children}
    </AppShell>
  );
}
