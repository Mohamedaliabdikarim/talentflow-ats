import type { Metadata } from "next";
import { FadeIn } from "@/components/motion/fade-in";
import { PageHeader } from "@/components/page-header";
import { PermissionDenied } from "@/components/permission-denied";
import { MembersTable } from "@/components/views/members-table";
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
      <MembersTable members={members} />
    </FadeIn>
  );
}
