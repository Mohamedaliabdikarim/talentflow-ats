import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { InviteUserForm } from "@/components/forms/invite-user-form";
import { FadeIn } from "@/components/motion/fade-in";
import { formatDateTime, PageHeader } from "@/components/page-header";
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
import { getOrganizationById, listOrganizationMembers } from "@/server/data/admin";

export const metadata: Metadata = { title: "Organization" };

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const organization = await getOrganizationById(organizationId);
  if (!organization) notFound();
  const members = await listOrganizationMembers(organization.id);

  return (
    <FadeIn>
      <PageHeader
        title={organization.name}
        description={`Workspace /o/${organization.slug} · created ${formatDateTime(organization.created_at)}`}
        actions={
          <Button asChild variant="outline">
            <Link href={`/o/${organization.slug}`}>
              <ExternalLink aria-hidden="true" />
              Open workspace
            </Link>
          </Button>
        }
      />
      <div className="grid gap-8 lg:grid-cols-[1fr_minmax(320px,400px)]">
        <section>
          <h2 className="text-lg font-semibold">Members</h2>
          {members.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No members yet. Invite the first user with the form.
            </p>
          ) : (
            <div className="mt-3 rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Since</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.membershipId}>
                      <TableCell className="font-medium">{member.email}</TableCell>
                      <TableCell>{member.fullName || "—"}</TableCell>
                      <TableCell className="capitalize">{member.role}</TableCell>
                      <TableCell>
                        <Badge variant={member.status === "active" ? "secondary" : "outline"}>
                          {member.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(member.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
        <section>
          <h2 className="text-lg font-semibold">Invite a user</h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            Creates a one-time invitation link to share privately. No email is sent.
          </p>
          <div className="rounded-lg border bg-card p-5">
            <InviteUserForm organizationId={organization.id} />
          </div>
        </section>
      </div>
    </FadeIn>
  );
}
