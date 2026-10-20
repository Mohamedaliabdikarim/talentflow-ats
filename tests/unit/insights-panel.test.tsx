// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobMatchResult } from "@/lib/ai/insights-contract";
import type { InsightView } from "@/server/data/insights";

/**
 * Candidate Insights panel states (ADR-035/038): gates, lifecycle, and the v2 result with
 * evidence attributed to the CV or GitHub, repository links only from the validated list, GitHub
 * status notes and provenance. Server Actions are mocked; nothing calls Azure or GitHub. Status
 * and source are always conveyed by icon + text, so the assertions are on text.
 */

const generateApplicationInsightsAction = vi.fn();
const getApplicationInsightAction = vi.fn();
vi.mock("@/server/actions/insights", () => ({
  generateApplicationInsightsAction: (...args: unknown[]) =>
    generateApplicationInsightsAction(...args),
  getApplicationInsightAction: (...args: unknown[]) => getApplicationInsightAction(...args),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

const { InsightsPanel } = await import("@/components/insights/insights-panel");

const REPO = "https://github.com/octocat/hello-world";

const base = {
  orgSlug: "acme",
  applicationId: "0f7c2e0a-6b1e-4a6a-9d1b-3f2d6a5c8e10",
  cvPresent: true,
  aiAuthorized: true,
  aiConfigured: true,
  candidateHref: "/o/acme/candidates/c1",
};

function insight(overrides: Partial<InsightView>): InsightView {
  return {
    id: "ins-1",
    status: "ready",
    result: null,
    errorMessage: null,
    generatedAt: "2026-10-21T10:00:00.000Z",
    modelVersion: "gpt-5-mini-2025-08-07",
    contractVersion: "job-match-v2",
    attemptCount: 1,
    createdAt: "2026-10-21T09:59:00.000Z",
    updatedAt: "2026-10-21T10:00:00.000Z",
    evidenceSources: ["cv"],
    githubLogin: null,
    githubStatus: "not_provided",
    sourceUrls: [],
    ...overrides,
  };
}

const CV_RESULT: JobMatchResult = {
  schema_version: "job-match-v2",
  summary: "Several years of TypeScript; cloud experience is not evidenced in the CV.",
  github_overview: "",
  assessments: [
    {
      requirement: "TypeScript",
      status: "supported",
      evidence: [{ source: "cv", text: "Two recent roles list it.", repository_url: null }],
    },
    {
      requirement: "Team leadership",
      status: "needs_verification",
      evidence: [
        {
          source: "cv",
          text: "Mentions mentoring juniors; no formal lead role.",
          repository_url: null,
        },
      ],
    },
    {
      requirement: "Azure",
      status: "not_evidenced",
      evidence: [{ source: "cv", text: "Nothing in the CV mentions Azure.", repository_url: null }],
    },
  ],
  interview_questions: ["Which cloud platforms have you deployed to?"],
  advisory_notice: "Advisory; a person reviews.",
};

const GITHUB_RESULT: JobMatchResult = {
  ...CV_RESULT,
  github_overview: "The hello-world repository shows exposure to TypeScript tooling.",
  assessments: [
    {
      requirement: "TypeScript",
      status: "supported",
      evidence: [
        { source: "cv", text: "Two recent roles list it.", repository_url: null },
        { source: "github", text: "hello-world is written in TypeScript.", repository_url: REPO },
      ],
    },
    ...CV_RESULT.assessments.slice(1),
  ],
};

const READY_CV = insight({ result: CV_RESULT });
const READY_GITHUB = insight({
  result: GITHUB_RESULT,
  evidenceSources: ["cv", "github"],
  githubLogin: "octocat",
  githubStatus: "included",
  sourceUrls: [REPO, "https://github.com/octocat/old-lib"],
});

beforeEach(() => {
  generateApplicationInsightsAction.mockReset();
  getApplicationInsightAction.mockReset();
});
afterEach(cleanup);

describe("InsightsPanel gates", () => {
  it("says so plainly when AI is not configured and offers nothing to click", () => {
    render(<InsightsPanel {...base} aiConfigured={false} initial={null} />);
    expect(screen.getByText(/not configured for this environment/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /generate/i })).not.toBeInTheDocument();
  });

  it("requires a CV before anything else", () => {
    render(<InsightsPanel {...base} cvPresent={false} initial={null} />);
    expect(screen.getByText("No CV to analyse")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open candidate" })).toHaveAttribute(
      "href",
      base.candidateHref,
    );
  });

  it("requires explicit AI authorization and never shows a generate control without it", () => {
    render(<InsightsPanel {...base} aiAuthorized={false} initial={null} />);
    expect(screen.getByText("AI authorization required")).toBeInTheDocument();
    expect(screen.getByText(/never assumed/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /generate/i })).not.toBeInTheDocument();
  });

  it("explains that previous insights were removed after a revocation", () => {
    render(
      <InsightsPanel {...base} aiAuthorized={false} initial={insight({ status: "revoked" })} />,
    );
    expect(screen.getByText(/previous insights were removed/)).toBeInTheDocument();
  });
});

describe("InsightsPanel lifecycle", () => {
  it("offers Generate when authorized and nothing was analysed yet, then shows the queued run", async () => {
    generateApplicationInsightsAction.mockResolvedValue({
      status: "success",
      message: "Analysis started.",
      data: { insightId: "ins-1" },
    });
    getApplicationInsightAction.mockResolvedValue({
      status: "success",
      data: insight({ status: "pending", generatedAt: null }),
    });
    render(<InsightsPanel {...base} initial={null} />);
    expect(screen.getByText("No insights yet")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Generate insights" }));
    expect(generateApplicationInsightsAction).toHaveBeenCalledWith("acme", base.applicationId);
    expect(await screen.findByText(/Analysing the CV against this job/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Candidate Insights" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("says when the GitHub profile is part of a running analysis", () => {
    render(
      <InsightsPanel
        {...base}
        initial={insight({
          status: "analyzing",
          evidenceSources: ["cv", "github"],
          githubLogin: "octocat",
        })}
      />,
    );
    expect(screen.getByText(/Analysing the CV and the GitHub profile/)).toBeInTheDocument();
  });

  it("shows the authorization error from the action without pretending to run", async () => {
    generateApplicationInsightsAction.mockResolvedValue({
      status: "error",
      message: "The candidate has not authorized AI analysis of their CV.",
    });
    render(<InsightsPanel {...base} initial={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Generate insights" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/has not authorized/);
    expect(getApplicationInsightAction).not.toHaveBeenCalled();
  });

  it("renders a CV-only result: advisory notice, summary, statuses with meaning, questions, provenance", () => {
    render(<InsightsPanel {...base} initial={READY_CV} />);
    expect(screen.getByText("Advisory only — a person decides")).toBeInTheDocument();
    expect(screen.getByText(CV_RESULT.summary)).toBeInTheDocument();

    const list = screen.getByRole("list", { name: "Requirement assessments" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("TypeScript");
    expect(items[0]).toHaveTextContent("Supported");
    expect(items[0]).toHaveTextContent("CV");
    expect(items[1]).toHaveTextContent("Needs verification");
    expect(items[2]).toHaveTextContent("Not evidenced");
    expect(items[2]).toHaveTextContent("Nothing in the CV mentions Azure.");

    expect(screen.getByText(/not a sign that the candidate lacks it/)).toBeInTheDocument();
    expect(screen.getByText("Which cloud platforms have you deployed to?")).toBeInTheDocument();
    expect(screen.getByTestId("insight-provenance")).toHaveTextContent(
      /Sources: the authorized CV/,
    );
    expect(screen.getByTestId("insight-provenance")).toHaveTextContent(
      /LinkedIn is never analysed/,
    );
    expect(screen.getByTestId("insight-provenance")).not.toHaveTextContent(/GitHub profile/);
    expect(screen.getByTestId("insight-provenance")).toHaveTextContent(/contract job-match-v2/);
    expect(screen.queryByText("What the GitHub profile shows")).not.toBeInTheDocument();
    expect(screen.queryByTestId("github-status-note")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeInTheDocument();
    // No score, grade or recommendation anywhere.
    expect(screen.queryByText(/\b(score|\d+\/10|\d+%|recommend)\b/i)).not.toBeInTheDocument();
  });

  it("distinguishes GitHub evidence from CV evidence and links only to the repositories it was given", () => {
    render(<InsightsPanel {...base} initial={READY_GITHUB} />);
    const list = screen.getByRole("list", { name: "Requirement assessments" });
    const first = within(list).getAllByRole("listitem")[0]!;
    expect(first).toHaveTextContent("CV");
    expect(first).toHaveTextContent("GitHub");
    expect(first).toHaveTextContent("hello-world is written in TypeScript.");
    const repoLink = within(first).getByRole("link", { name: /octocat\/hello-world/ });
    expect(repoLink).toHaveAttribute("href", REPO);
    expect(repoLink).toHaveAttribute("target", "_blank");
    expect(repoLink).toHaveAttribute("rel", "noopener noreferrer");

    expect(screen.getByText("What the GitHub profile shows")).toBeInTheDocument();
    expect(screen.getByText(GITHUB_RESULT.github_overview)).toBeInTheDocument();
    expect(screen.getByText(/exposure to a technology, not proficiency/)).toBeInTheDocument();

    const provenance = screen.getByTestId("insight-provenance");
    expect(within(provenance).getByRole("link", { name: /@octocat/ })).toHaveAttribute(
      "href",
      "https://github.com/octocat",
    );
    expect(provenance).toHaveTextContent(/Repositories considered/);
    expect(within(provenance).getByRole("link", { name: /octocat\/old-lib/ })).toHaveAttribute(
      "href",
      "https://github.com/octocat/old-lib",
    );
    expect(provenance).toHaveTextContent(/LinkedIn is never analysed/);
  });

  it("explains why GitHub evidence was not used, without a GitHub section", () => {
    render(
      <InsightsPanel
        {...base}
        initial={insight({
          result: CV_RESULT,
          githubLogin: "octocat",
          githubStatus: "rate_limited",
        })}
      />,
    );
    expect(screen.getByTestId("github-status-note")).toHaveTextContent(/rate limit was reached/);
    expect(screen.queryByText("What the GitHub profile shows")).not.toBeInTheDocument();
    expect(screen.getByTestId("insight-provenance")).not.toHaveTextContent(/GitHub profile/);
  });

  it("shows the failure message with a Retry that queues again", async () => {
    generateApplicationInsightsAction.mockResolvedValue({
      status: "success",
      message: "Analysis started.",
      data: { insightId: "ins-2" },
    });
    getApplicationInsightAction.mockResolvedValue({
      status: "success",
      data: insight({ id: "ins-2", status: "pending", attemptCount: 1 }),
    });
    render(
      <InsightsPanel
        {...base}
        initial={insight({
          status: "failed",
          errorMessage: "Azure OpenAI rate limit reached; retry shortly.",
          attemptCount: 2,
        })}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/rate limit reached/);
    expect(screen.getByRole("alert")).toHaveTextContent("(2 attempts)");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(generateApplicationInsightsAction).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/Analysing the CV/)).toBeInTheDocument();
  });

  it("offers to generate again after a GitHub revocation while the CV authorization stands", () => {
    render(
      <InsightsPanel
        {...base}
        initial={insight({
          status: "revoked",
          errorMessage:
            "GitHub authorization was revoked, so insights that used GitHub evidence were removed.",
        })}
      />,
    );
    expect(screen.getByText(/GitHub authorization was revoked/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate insights" })).toBeInTheDocument();
  });

  it("falls back to the empty state when a ready row has no usable result", () => {
    render(<InsightsPanel {...base} initial={insight({ status: "ready", result: null })} />);
    expect(screen.getByText("No insights yet")).toBeInTheDocument();
  });
});
