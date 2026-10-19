import type { Metadata } from "next";
import { OrganizationsView } from "@/components/views/admin-overview";
import { listOrganizations } from "@/server/data/admin";

export const metadata: Metadata = { title: "Organizations" };

export default async function OrganizationsPage() {
  const organizations = await listOrganizations();
  return <OrganizationsView base="/admin" organizations={organizations} />;
}
