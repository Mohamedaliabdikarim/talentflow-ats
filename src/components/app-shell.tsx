import Link from "next/link";
import { LogOut } from "lucide-react";
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
  children,
}: AppShellProps) {
  return (
    <div className="flex min-h-full flex-1">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
        <div className="px-4 py-4">
          <Link href="/app" className="text-base font-semibold tracking-tight">
            TalentFlow
          </Link>
          <p className="mt-1 truncate text-sm font-medium">{title}</p>
          {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        <nav aria-label="Primary" className="flex flex-col gap-1 px-2">
          {items.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b bg-card px-4">
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
              <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">Preview</span>
            )}
          </div>
        </header>
        {banner}
        <main id="main" className="flex-1 px-4 py-6 md:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
