// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActionState } from "@/lib/action-state";

/** GitHub evidence card states (ADR-038): no URL, URL without authorization (unchecked consent), authorized. */

vi.mock("@/server/actions/candidate-github", () => ({
  authorizeCandidateGithubAiAction: vi.fn(async (): Promise<ActionState> => ({ status: "idle" })),
  revokeCandidateGithubAiAction: vi.fn(async (): Promise<ActionState> => ({ status: "idle" })),
}));

const { CandidateGithubCard } = await import("@/components/forms/candidate-github-card");

const NO_CONSENT = { authorized: false, authorizedAt: null, authorizedByEmail: null, basis: null };

afterEach(cleanup);

describe("CandidateGithubCard", () => {
  it("explains that only the exact provided profile is used when there is no URL", () => {
    render(
      <CandidateGithubCard orgSlug="acme" candidateId="c1" githubUrl={null} consent={NO_CONSENT} />,
    );
    expect(screen.getByText(/No GitHub profile URL on file/)).toBeInTheDocument();
    expect(screen.getByText(/Only the exact profile the candidate provides/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("links to the profile safely and shows an unchecked consent form when not authorized", () => {
    render(
      <CandidateGithubCard
        orgSlug="acme"
        candidateId="c1"
        githubUrl="https://github.com/octocat"
        consent={NO_CONSENT}
      />,
    );
    const link = screen.getByRole("link", { name: /Profile provided/ });
    expect(link).toHaveAttribute("href", "https://github.com/octocat");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("Not authorized")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByLabelText("Stated basis")).toBeRequired();
    expect(screen.getByRole("button", { name: "Record authorization" })).toBeInTheDocument();
    expect(screen.getByText(/Changing the URL resets this authorization/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revoke authorization" })).not.toBeInTheDocument();
  });

  it("shows who recorded the authorization and offers to revoke it", () => {
    render(
      <CandidateGithubCard
        orgSlug="acme"
        candidateId="c1"
        githubUrl="https://github.com/octocat"
        consent={{
          authorized: true,
          authorizedAt: "2026-10-21T10:00:00Z",
          authorizedByEmail: "recruiter@example.test",
          basis: "Candidate listed the profile and agreed",
        }}
      />,
    );
    expect(screen.getByText("Authorized")).toBeInTheDocument();
    expect(screen.getByText(/by recruiter@example.test/)).toBeInTheDocument();
    expect(screen.getByText("Candidate listed the profile and agreed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revoke authorization" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
