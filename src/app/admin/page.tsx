import type { Metadata } from "next";
import { AdminOverviewView } from "@/components/views/admin-overview";
import { getAdminOverview } from "@/server/data/admin";

export const metadata: Metadata = { title: "Admin overview" };

export default async function AdminOverviewPage() {
  const overview = await getAdminOverview();
  return <AdminOverviewView base="/admin" overview={overview} />;
}
