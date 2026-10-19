import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { FadeIn } from "@/components/motion/fade-in";
import { EmptyState, formatDateTime, PageHeader } from "@/components/page-header";
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
import { listOrganizations } from "@/server/data/admin";

export const metadata: Metadata = { title: "Organizations" };

export default async function OrganizationsPage() {
  const organizations = await listOrganizations();

  return (
    <FadeIn>
      <PageHeader
        title="Organizations"
        description="Each organization is an isolated customer workspace."
        actions={
          <Button asChild>
            <Link href="/admin/organizations/new">
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
              <Link href="/admin/organizations/new">Create organization</Link>
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
                      href={`/admin/organizations/${organization.id}`}
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
