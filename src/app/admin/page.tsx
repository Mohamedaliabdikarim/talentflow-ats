import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { FadeIn } from "@/components/motion/fade-in";
import { formatDateTime, PageHeader, StatCard } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getAdminOverview } from "@/server/data/admin";

export const metadata: Metadata = { title: "Admin overview" };

export default async function AdminOverviewPage() {
  const overview = await getAdminOverview();

  return (
    <FadeIn>
      <PageHeader
        title="Overview"
        description="Customer organizations, platform admins and recent security events."
        actions={
          <Button asChild>
            <Link href="/admin/organizations/new">
              <Plus aria-hidden="true" />
              Create organization
            </Link>
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Organizations" value={overview.organizationCount} />
        <StatCard label="Active members" value={overview.activeMemberCount} />
        <StatCard label="Platform admins" value={overview.adminCount} />
      </div>
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Recent audit events</h2>
        {overview.recentEvents.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No events recorded yet.</p>
        ) : (
          <ul className="mt-3 divide-y rounded-lg border bg-card">
            {overview.recentEvents.map((event) => (
              <li
                key={event.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm"
              >
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {event.action}
                </code>
                <span className="text-muted-foreground">{event.actorEmail ?? "system"}</span>
                {event.organizationName ? <span>· {event.organizationName}</span> : null}
                <span className="ml-auto text-xs text-muted-foreground">
                  {formatDateTime(event.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/admin/audit"
          className="mt-3 inline-block text-sm text-primary underline-offset-4 hover:underline"
        >
          View full audit log
        </Link>
      </section>
    </FadeIn>
  );
}
