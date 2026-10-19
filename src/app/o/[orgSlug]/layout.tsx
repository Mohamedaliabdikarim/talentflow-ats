import { LayoutDashboard, Users } from "lucide-react";
import { AdminContextBanner } from "@/components/admin-context-banner";
import { AppShell } from "@/components/app-shell";
import type { NavItem } from "@/components/nav-link";
import { PermissionDenied } from "@/components/permission-denied";
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
    await recordAdminContextEntry(organization.id);
  }

  const base = `/o/${organization.slug}`;
  // Jobs, candidates and the pipeline are added to this navigation in Phase 2 and 3.
  const nav: NavItem[] = [
    { href: base, label: "Overview", icon: LayoutDashboard, exact: true },
    { href: `${base}/members`, label: "Members", icon: Users },
  ];

  return (
    <AppShell
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
