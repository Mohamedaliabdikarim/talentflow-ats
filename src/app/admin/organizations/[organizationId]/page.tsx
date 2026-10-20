import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { InviteUserForm } from "@/components/forms/invite-user-form";
import { MembershipControls } from "@/components/forms/membership-controls";
import { FadeIn } from "@/components/motion/fade-in";
import { formatDateTime, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { MembersTable } from "@/components/views/members-table";
import { getOrganizationById, listOrganizationMembers } from "@/server/data/admin";

export const metadata: Metadata = { title: "Organization" };

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  // Independent reads under the admin's RLS view run in one round trip (ADR-042).
  const [organization, members] = await Promise.all([
    getOrganizationById(organizationId),
    listOrganizationMembers(organizationId),
  ]);
  if (!organization) notFound();

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
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
        <section className="min-w-0">
          <h2 className="text-lg font-semibold">Members</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Change roles, deactivate or reactivate access. An organization always keeps at least one
            active owner. Every change is audited.
          </p>
          <div className="mt-3">
            <MembersTable
              members={members}
              showResend
              renderActions={(member) => (
                <MembershipControls
                  organizationId={organization.id}
                  membershipId={member.membershipId}
                  role={member.role}
                  status={member.status}
                />
              )}
            />
          </div>
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
