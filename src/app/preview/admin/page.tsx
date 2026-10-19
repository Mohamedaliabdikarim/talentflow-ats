import type { Metadata } from "next";
import { AdminOverviewView } from "@/components/views/admin-overview";
import { PREVIEW_ADMIN_ORGANIZATIONS, PREVIEW_AUDIT_EVENTS } from "@/preview/demo-data";

export const metadata: Metadata = { title: "Admin overview (preview)" };

export default function PreviewAdminOverviewPage() {
  return (
    <AdminOverviewView
      base="/preview/admin"
      overview={{
        organizationCount: PREVIEW_ADMIN_ORGANIZATIONS.length,
        adminCount: 2,
        activeMemberCount: PREVIEW_ADMIN_ORGANIZATIONS.reduce((sum, o) => sum + o.member_count, 0),
        recentEvents: PREVIEW_AUDIT_EVENTS.slice(0, 5),
      }}
    />
  );
}
