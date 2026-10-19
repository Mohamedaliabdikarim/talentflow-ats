import { Building2, LayoutDashboard, ScrollText, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import type { NavItem } from "@/components/nav-link";
import { PermissionDenied } from "@/components/permission-denied";
import { isPlatformAdmin, requireUser } from "@/server/auth";

const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/organizations", label: "Organizations", icon: Building2 },
  { href: "/admin/admins", label: "Platform admins", icon: ShieldCheck },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/admin");
  if (!(await isPlatformAdmin())) {
    return <PermissionDenied />;
  }
  return (
    <AppShell
      title="Platform admin"
      subtitle="All customers"
      items={ADMIN_NAV}
      userEmail={user.email}
    >
      {children}
    </AppShell>
  );
}
