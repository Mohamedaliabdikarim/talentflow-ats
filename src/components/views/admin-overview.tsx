import Link from "next/link";
import { Plus } from "lucide-react";
import { FadeIn } from "@/components/motion/fade-in";
import { EmptyState, formatDateTime, PageHeader, StatCard } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AuditRow, OrganizationSummary } from "@/server/data/admin";

export type AdminOverview = {
  organizationCount: number;
  adminCount: number;
  activeMemberCount: number;
  recentEvents: AuditRow[];
};

/** Platform-admin landing page body; `base` is "/admin" or the preview equivalent. */
export function AdminOverviewView({ base, overview }: { base: string; overview: AdminOverview }) {
  return (
    <FadeIn>
      <PageHeader
        title="Overview"
        description="Customer organizations, platform admins and recent security events."
        actions={
          <Button asChild>
            <Link href={`${base}/organizations/new`}>
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
          href={`${base}/audit`}
          className="mt-3 inline-block text-sm text-primary underline-offset-4 hover:underline"
        >
          View full audit log
        </Link>
      </section>
    </FadeIn>
  );
}

export function OrganizationsView({
  base,
  organizations,
  workspaceHref,
}: {
  base: string;
  organizations: OrganizationSummary[];
  /** Builds the link to an organization's detail page. */
  workspaceHref?: (organization: OrganizationSummary) => string;
}) {
  return (
    <FadeIn>
      <PageHeader
        title="Organizations"
        description="Each organization is an isolated customer workspace."
        actions={
          <Button asChild>
            <Link href={`${base}/organizations/new`}>
              <Plus aria-hidden="true" />
              Create organization
            </Link>
          </Button>
        }
      />
      {organizations.length === 0 ? (
        <EmptyState
          title="No organizations yet"
          description="Create the first customer organization and invite its first user."
          action={
            <Button asChild>
              <Link href={`${base}/organizations/new`}>Create organization</Link>
            </Button>
          }
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Members</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organizations.map((organization) => (
                <TableRow key={organization.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={
                        workspaceHref
                          ? workspaceHref(organization)
                          : `${base}/organizations/${organization.id}`
                      }
                      className="underline-offset-4 hover:underline"
                    >
                      {organization.name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{organization.slug}</TableCell>
                  <TableCell>
                    <Badge variant={organization.status === "active" ? "secondary" : "destructive"}>
                      {organization.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {organization.member_count}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(organization.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </FadeIn>
  );
}
