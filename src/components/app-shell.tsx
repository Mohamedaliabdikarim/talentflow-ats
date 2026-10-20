import Link from "next/link";
import { LogOut } from "lucide-react";
import { cn } from "cn";
import { MobileNav } from "@/components/mobile-nav";
import { NavLink, type NavItem } from "@/components/nav-link";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/server/actions/auth";

type AppShellProps = {
  /** Area name shown in the sidebar header, for example the organization name. */
  title: string;
  subtitle?: string;
  items: NavItem[];
  userEmail: string;
  /** Rendered above the page content (admin context banner). */
  banner?: React.ReactNode;
  /** False in the local preview, which has no session to sign out of. */
  signOut?: boolean;
  /** "app" applies the navy customer-workspace theme; admin leaves it unset (ADR-032). */
  theme?: "app";
  children: React.ReactNode;
};

/**
 * Responsive application shell (docs/DESIGN.md §3): sidebar from 768 px, sheet drawer
 * below, compact top bar with the user menu. The sign-out control is a real form so it
 * works without JavaScript and cannot be triggered by a GET request.
 */
export function AppShell({
  title,
  subtitle,
  items,
  userEmail,
  banner,
  signOut = true,
  theme,
  children,
}: AppShellProps) {
  const isApp = theme === "app";
  return (
    <div className={cn("flex min-h-full flex-1 bg-background text-foreground", isApp && "app")}>
      <aside
        className={cn(
          "hidden w-64 shrink-0 flex-col border-r border-sidebar-border text-sidebar-foreground md:flex",
          isApp ? "app-sidebar-surface" : "bg-sidebar",
        )}
      >
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span
            aria-hidden
            className={cn(
              "flex size-8 items-center justify-center rounded-lg text-sm font-bold text-white shadow-sm",
              isApp ? "app-brand-mark" : "bg-primary text-primary-foreground",
            )}
          >
            T
          </span>
          <Link href="/app" className="text-base font-semibold tracking-tight">
            TalentFlow
          </Link>
        </div>
        <div className="px-5 pb-4">
          <p className="truncate text-sm font-medium">{title}</p>
          {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        <nav aria-label="Primary" className="flex flex-col gap-1 px-3">
          {items.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </nav>
        <div className="mt-auto px-5 py-4">
          <p className="text-xs text-muted-foreground">TalentFlow ATS</p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-sm md:px-6">
          <MobileNav title={title} items={items} />
          <p className="truncate text-sm font-medium md:hidden">{title}</p>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden max-w-56 truncate text-sm text-muted-foreground sm:inline">
              {userEmail}
            </span>
            {signOut ? (
              <form action={signOutAction}>
                <Button type="submit" variant="ghost" size="sm">
                  <LogOut aria-hidden="true" />
                  Sign out
                </Button>
              </form>
            ) : (
              <span className="rounded-md border border-border bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                Preview
              </span>
            )}
          </div>
        </header>
        {banner}
        <main id="main" className="flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
