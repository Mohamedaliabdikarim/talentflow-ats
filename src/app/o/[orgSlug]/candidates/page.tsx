import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { ExternalLink } from "@/components/external-link";
import { FadeIn } from "@/components/motion/fade-in";
import { EmptyState, formatDateTime, PageHeader } from "@/components/page-header";
import { PermissionDenied } from "@/components/permission-denied";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  const base = `/o/${orgSlug}`;

  return (
    <FadeIn>
      <PageHeader
        title="Candidates"
        description="People in this workspace. One candidate can be in several job pipelines."
        actions={
          <Button asChild>
            <Link href={`${base}/candidates/new`}>
              <Plus aria-hidden="true" />
              Add candidate
            </Link>
          </Button>
        }
      />
      <form
        method="get"
        action={`${base}/candidates`}
        role="search"
        aria-label="Search candidates"
        className="mb-6 flex flex-wrap items-end gap-3"
      >
        <div className="space-y-1.5">
          <Label htmlFor="q">Name</Label>
          <Input
            id="q"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Search by name"
            className="w-64"
            autoComplete="off"
          />
        </div>
        <Button type="submit" variant="secondary">
          <Search aria-hidden="true" />
          Search
        </Button>
        {query ? (
          <Button asChild variant="ghost">
            <Link href={`${base}/candidates`}>Clear</Link>
          </Button>
        ) : null}
      </form>
      {candidates.length === 0 ? (
        query ? (
          <EmptyState
            title={`No candidates match "${query}"`}
            description="Check the spelling or clear the search."
          />
        ) : (
          <EmptyState
            title="No candidates yet"
            description="Add the first candidate and link them to a job."
            action={
              <Button asChild>
                <Link href={`${base}/candidates/new`}>Add candidate</Link>
              </Button>
            }
          />
        )
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Headline</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Profiles</TableHead>
                <TableHead>Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.map((candidate) => (
                <TableRow key={candidate.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`${base}/candidates/${candidate.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {candidate.full_name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {candidate.headline ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{candidate.email ?? "—"}</TableCell>
                  <TableCell className="space-x-3">
                    {candidate.linkedin_url ? (
                      <ExternalLink href={candidate.linkedin_url}>LinkedIn</ExternalLink>
                    ) : null}
                    {candidate.github_url ? (
                      <ExternalLink href={candidate.github_url}>GitHub</ExternalLink>
                    ) : null}
                    {!candidate.linkedin_url && !candidate.github_url ? "—" : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(candidate.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </FadeIn>
  );
}
