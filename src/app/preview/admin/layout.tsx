import { AppShell } from "@/components/app-shell";
import type { NavItem } from "@/components/nav-link";

const NAV: NavItem[] = [
  { href: "/preview/admin", label: "Overview", icon: "dashboard", exact: true },
  { href: "/preview/admin/organizations", label: "Organizations", icon: "organizations" },
  { href: "/preview/admin/audit", label: "Audit log", icon: "audit" },
];

export default function PreviewAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      title="Platform admin"
      subtitle="All customers (preview)"
      items={NAV}
      userEmail="admin@example.test"
      signOut={false}
    >
      {children}
    </AppShell>
  );
}
