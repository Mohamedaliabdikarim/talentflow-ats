import type { Metadata } from "next";
import { OrganizationsView } from "@/components/views/admin-overview";
import { PREVIEW_ADMIN_ORGANIZATIONS } from "@/preview/demo-data";
import { PREVIEW_BASE, PREVIEW_ORG_SLUG } from "@/preview/enabled";

export const metadata: Metadata = { title: "Organizations (preview)" };

export default function PreviewOrganizationsPage() {
  return (
    <OrganizationsView
      base="/preview/admin"
      organizations={PREVIEW_ADMIN_ORGANIZATIONS}
      workspaceHref={(organization) =>
        organization.slug === PREVIEW_ORG_SLUG ? PREVIEW_BASE : "/preview"
      }
    />
  );
}
