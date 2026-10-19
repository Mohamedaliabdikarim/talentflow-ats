import type { Metadata } from "next";
import { PermissionDenied } from "@/components/permission-denied";
import { CandidatesView } from "@/components/views/candidates-table";
import { getOrganizationContext } from "@/server/auth";
import { listCandidates } from "@/server/data/candidates";

export const metadata: Metadata = { title: "Candidates" };

export default async function CandidatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { orgSlug } = await params;
  const organization = await getOrganizationContext(orgSlug);
  if (!organization) return <PermissionDenied />;
  const rawQuery = (await searchParams).q;
  const query = (Array.isArray(rawQuery) ? rawQuery[0] : rawQuery)?.trim().slice(0, 160) ?? "";
  const candidates = await listCandidates(organization.id, query || undefined);
  return <CandidatesView base={`/o/${orgSlug}`} candidates={candidates} query={query} />;
}
