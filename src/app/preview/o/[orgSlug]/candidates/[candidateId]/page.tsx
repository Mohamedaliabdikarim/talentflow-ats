import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CandidateDetailView } from "@/components/views/candidate-detail";
import { PREVIEW_BASE } from "@/preview/enabled";
import { previewCandidate, previewCandidateApplications } from "@/preview/store";

type Params = Promise<{ candidateId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { candidateId } = await params;
  const candidate = previewCandidate(candidateId);
  return { title: candidate ? `${candidate.full_name} (preview)` : "Candidate (preview)" };
}

export default async function PreviewCandidateDetailPage({ params }: { params: Params }) {
  const { candidateId } = await params;
  const candidate = previewCandidate(candidateId);
  if (!candidate) notFound();
  return (
    <CandidateDetailView
      base={PREVIEW_BASE}
      candidate={candidate}
      applications={previewCandidateApplications(candidate.id)}
      actions={
        <Button disabled title="Disabled in preview">
          <Plus aria-hidden="true" />
          Add to job
        </Button>
      }
      renderRemove={() => (
        <Button
          variant="outline"
          size="sm"
          className="text-destructive"
          disabled
          title="Disabled in preview"
        >
          Remove
        </Button>
      )}
      dangerZone={
        <Button variant="outline" className="text-destructive" disabled title="Disabled in preview">
          Delete candidate
        </Button>
      }
    />
  );
}
