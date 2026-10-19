import type { Metadata } from "next";
import { CandidatesView } from "@/components/views/candidates-table";
import { PREVIEW_BASE } from "@/preview/enabled";
import { previewCandidates } from "@/preview/store";

export const metadata: Metadata = { title: "Candidates (preview)" };

export default async function PreviewCandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const rawQuery = (await searchParams).q;
  const query = (Array.isArray(rawQuery) ? rawQuery[0] : rawQuery)?.trim().slice(0, 160) ?? "";
  return (
    <CandidatesView
      base={PREVIEW_BASE}
      candidates={previewCandidates(query || undefined)}
      query={query}
    />
  );
}
