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
        "group relative flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors duration-150",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
      )}
    >
      {/* Active indicator: a short accent bar on the leading edge. */}
      <span
        aria-hidden
        className={cn(
          "absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-full bg-sidebar-primary transition-opacity duration-150",
          active ? "opacity-100" : "opacity-0",
        )}
      />
      <Icon
        className={cn(
          "size-4 transition-colors",
          active
            ? "text-sidebar-primary"
            : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground",
        )}
        aria-hidden
      />
      {item.label}
    </Link>
  );
}
