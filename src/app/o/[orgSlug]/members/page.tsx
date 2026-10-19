import type { Metadata } from "next";
import { PermissionDenied } from "@/components/permission-denied";
import { FadeIn } from "@/components/motion/fade-in";
import { formatDateTime, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getOrganizationContext } from "@/server/auth";
import { listOrganizationMembers } from "@/server/data/admin";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const organization = await getOrganizationContext(orgSlug);
  if (!organization) return <PermissionDenied />;
  const members = await listOrganizationMembers(organization.id);

  return (
    <FadeIn>
      <PageHeader
        title="Members"
        description="People with access to this workspace. Invitations are managed by the platform admin."
      />
      <div className="rounded-lg border bg-card">
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
    </FadeIn>
  );
}
