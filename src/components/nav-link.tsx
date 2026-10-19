"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  Building2,
  LayoutDashboard,
  LayoutGrid,
  type LucideIcon,
  ScrollText,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import { cn } from "cn";

/**
 * Icons are referenced by name: Server Components may only pass serializable props to
 * Client Components, and a component reference is a function. The client resolves the
 * name to the Lucide component here.
 */
export type NavIconName =
  | "dashboard"
  | "organizations"
  | "admins"
  | "audit"
  | "jobs"
  | "candidates"
  | "pipeline"
  | "members";

const NAV_ICONS: Record<NavIconName, LucideIcon> = {
  dashboard: LayoutDashboard,
  organizations: Building2,
  admins: ShieldCheck,
  audit: ScrollText,
  jobs: Briefcase,
  candidates: UserRound,
  pipeline: LayoutGrid,
  members: Users,
};

export type NavItem = {
  href: string;
  label: string;
  icon: NavIconName;
  /** Match only the exact path (for overview pages that are prefixes of others). */
  exact?: boolean;
};

export function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
  const Icon = NAV_ICONS[item.icon];
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-10 items-center gap-2.5 rounded-md px-3 text-sm font-medium transition-colors duration-150",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}
    >
      <Icon className="size-4" aria-hidden />
      {item.label}
    </Link>
  );
}
