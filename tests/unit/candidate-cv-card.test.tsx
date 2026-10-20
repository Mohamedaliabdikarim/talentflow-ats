// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActionState } from "@/lib/action-state";

/** CV card UI states (ADR-033): empty vs present, actions, and consent never pre-checked. */

vi.mock("@/server/actions/candidate-cv", () => ({
  uploadCandidateCvAction: vi.fn(async (): Promise<ActionState> => ({ status: "idle" })),
  deleteCandidateCvAction: vi.fn(async (): Promise<ActionState> => ({ status: "idle" })),
  authorizeCandidateCvAiAction: vi.fn(async (): Promise<ActionState> => ({ status: "idle" })),
  revokeCandidateCvAiAction: vi.fn(async (): Promise<ActionState> => ({ status: "idle" })),
}));

const PRESENT_CV = {
  filename: "alex-cv.pdf",
  sizeBytes: 2048,
  uploadedAt: "2026-10-20T09:00:00Z",
  source: "candidate_provided_recruiter_upload",
};
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

const { CandidateCvCard } = await import("@/components/forms/candidate-cv-card");

const NO_CONSENT = { authorized: false, authorizedAt: null, authorizedByEmail: null, basis: null };

afterEach(cleanup);

describe("CandidateCvCard", () => {
  it("empty state offers an upload control and no view/download", () => {
    render(
      <CandidateCvCard
        base="/o/acme"
        orgSlug="acme"
        candidateId="c1"
        cv={null}
        consent={NO_CONSENT}
      />,
    );
    expect(screen.getByText(/No CV uploaded yet/)).toBeTruthy();
    expect(screen.getByLabelText("Upload a CV (PDF)")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "View" })).toBeNull();
    // The consent panel appears only once a CV exists.
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("present state shows the file, View/Download/Replace/Delete, and an unchecked consent box", () => {
    render(
      <CandidateCvCard
        base="/o/acme"
        orgSlug="acme"
        candidateId="c1"
        cv={{
          filename: "alex-cv.pdf",
          sizeBytes: 2048,
          uploadedAt: "2026-10-20T09:00:00Z",
          source: "candidate_provided_recruiter_upload",
        }}
        consent={NO_CONSENT}
      />,
    );
    expect(screen.getByText("alex-cv.pdf")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View" }).getAttribute("href")).toContain("/cv");
    expect(screen.getByRole("link", { name: "Download" }).getAttribute("href")).toContain(
      "download=1",
    );
    expect(screen.getByRole("button", { name: "Replace" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Delete CV/ })).toBeTruthy();

    const consentBox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(consentBox.checked).toBe(false); // never pre-checked
    expect(screen.getByRole("button", { name: "Record authorization" })).toBeTruthy();
    expect(screen.getByText(/does not permit AI analysis/)).toBeTruthy();
  });

  it("authorized state shows the record and a revoke control, no checkbox", () => {
    render(
      <CandidateCvCard
        base="/o/acme"
        orgSlug="acme"
        candidateId="c1"
        cv={{
          filename: "alex-cv.pdf",
          sizeBytes: 2048,
          uploadedAt: "2026-10-20T09:00:00Z",
          source: "candidate_provided_recruiter_upload",
        }}
        consent={{
          authorized: true,
          authorizedAt: "2026-10-20T10:00:00Z",
          authorizedByEmail: "recruiter@example.test",
          basis: "candidate emailed written consent",
        }}
      />,
    );
    expect(screen.getByText("Authorized")).toBeTruthy();
    expect(screen.getByText(/candidate emailed written consent/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Revoke authorization" })).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("does not keep a stale upload success note after the CV is deleted", async () => {
    const actions = await import("@/server/actions/candidate-cv");
    vi.mocked(actions.uploadCandidateCvAction).mockResolvedValueOnce({
      status: "success",
      message: "CV replaced.",
      data: undefined,
    });

    const { rerender } = render(
      <CandidateCvCard
        base="/o/acme"
        orgSlug="acme"
        candidateId="c1"
        cv={PRESENT_CV}
        consent={NO_CONSENT}
      />,
    );
    const replaceForm = screen
      .getByLabelText("Replace the CV with another PDF")
      .closest("form") as HTMLFormElement;
    fireEvent.submit(replaceForm);
    expect(await screen.findByText("CV replaced.")).toBeTruthy();

    // Deleting the CV re-renders the card with cv=null (revalidation); the note must clear.
    rerender(
      <CandidateCvCard
        base="/o/acme"
        orgSlug="acme"
        candidateId="c1"
        cv={null}
        consent={NO_CONSENT}
      />,
    );
    expect(screen.queryByText("CV replaced.")).toBeNull();
    expect(screen.getByText(/No CV uploaded yet/)).toBeTruthy();
  });
});
