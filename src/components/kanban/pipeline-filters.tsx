import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PipelineFilters as Filters } from "@/lib/pipeline";

const ALL_JOBS = "all";

/**
 * Job and candidate-name filters as a plain GET form: the filtered board has a shareable
 * URL (?job=&q=) and works without JavaScript. Both filters combine on the server.
 */
export function PipelineFilters({
  orgSlug,
  jobs,
  filters,
}: {
  orgSlug: string;
  jobs: Array<{ id: string; title: string }>;
  filters: Filters;
}) {
  const hasFilters = Boolean(filters.jobId || filters.q);
  return (
    <form
      method="get"
      action={`/o/${orgSlug}/pipeline`}
      role="search"
      aria-label="Filter the pipeline"
      className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3"
    >
      <div className="space-y-1.5">
        <Label htmlFor="job">Job</Label>
        <Select name="job" defaultValue={filters.jobId ?? ALL_JOBS}>
          <SelectTrigger id="job" className="w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_JOBS}>All jobs</SelectItem>
            {jobs.map((job) => (
              <SelectItem key={job.id} value={job.id}>
                {job.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="q">Candidate name</Label>
        <Input
          id="q"
          name="q"
          type="search"
          defaultValue={filters.q ?? ""}
          placeholder="Search by name"
          className="w-60"
          autoComplete="off"
        />
      </div>
      <Button type="submit" variant="secondary">
        <SlidersHorizontal aria-hidden="true" />
        Apply filters
      </Button>
      {hasFilters ? (
        <Button asChild variant="ghost">
          <Link href={`/o/${orgSlug}/pipeline`}>Clear</Link>
        </Button>
      ) : null}
    </form>
  );
}
