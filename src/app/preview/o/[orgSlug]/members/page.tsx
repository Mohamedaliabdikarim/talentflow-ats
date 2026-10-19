import type { Metadata } from "next";
import { FadeIn } from "@/components/motion/fade-in";
import { PageHeader } from "@/components/page-header";
import { MembersTable } from "@/components/views/members-table";
import { PREVIEW_MEMBERS } from "@/preview/demo-data";

export const metadata: Metadata = { title: "Members (preview)" };

export default function PreviewMembersPage() {
  return (
    <FadeIn>
      <PageHeader
        title="Members"
        description="People with access to this workspace. Invitations are managed by the platform admin."
      />
      <MembersTable members={PREVIEW_MEMBERS} />
    </FadeIn>
  );
}
