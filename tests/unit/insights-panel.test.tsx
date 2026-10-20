// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InsightView } from "@/server/data/insights";

/**
 * Candidate Insights panel states (ADR-035 §7): not configured, no CV, authorization required,
 * none yet, analysing, ready, failed/retry, revoked. Server Actions are mocked; nothing calls
 * Azure. Status is always conveyed by icon + text, so the assertions are on text.
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
    contractVersion: "job-match-v1",
    attemptCount: 1,
    createdAt: "2026-10-21T09:59:00.000Z",
    updatedAt: "2026-10-21T10:00:00.000Z",
    ...overrides,
  };
}

const READY = insight({
  result: {
    schema_version: "job-match-v1",
    summary: "Several years of TypeScript; cloud experience is not evidenced in the CV.",
    assessments: [
      { requirement: "TypeScript", status: "supported", evidence: "Two recent roles list it." },
      {
        requirement: "Team leadership",
        status: "needs_verification",
        evidence: "Mentions mentoring juniors; no formal lead role.",
      },
      {
        requirement: "Azure",
        status: "not_evidenced",
        evidence: "Nothing in the CV mentions Azure.",
      },
    ],
    interview_questions: ["Which cloud platforms have you deployed to?"],
    advisory_notice: "Advisory; a person reviews.",
  },
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

  it("renders a ready result: advisory notice, summary, statuses with meaning, questions, provenance", () => {
    render(<InsightsPanel {...base} initial={READY} />);
    expect(screen.getByText("Advisory only — a person decides")).toBeInTheDocument();
    expect(screen.getByText(READY.result!.summary)).toBeInTheDocument();

    const list = screen.getByRole("list", { name: "Requirement assessments" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("TypeScript");
    expect(items[0]).toHaveTextContent("Supported by CV");
    expect(items[1]).toHaveTextContent("Needs verification");
    expect(items[2]).toHaveTextContent("Not evidenced in CV");
    expect(items[2]).toHaveTextContent("Nothing in the CV mentions Azure.");

    // "Not evidenced" is explained as absence of evidence, never as a deficiency.
    expect(screen.getByText(/not a sign that the candidate lacks it/)).toBeInTheDocument();
    expect(screen.getByText("Which cloud platforms have you deployed to?")).toBeInTheDocument();
    expect(screen.getByText(/model gpt-5-mini-2025-08-07/)).toBeInTheDocument();
    expect(screen.getByText(/contract job-match-v1/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeInTheDocument();
    // No score, grade or recommendation anywhere.
    expect(screen.queryByText(/\b(score|\d+\/10|\d+%|recommend)\b/i)).not.toBeInTheDocument();
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

  it("offers to generate again after a revocation once authorization is back", () => {
    render(
      <InsightsPanel
        {...base}
        initial={insight({ status: "revoked", errorMessage: "AI authorization was revoked." })}
      />,
    );
    expect(screen.getByText("AI authorization was revoked.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate insights" })).toBeInTheDocument();
  });

  it("falls back to the empty state when a ready row has no usable result", () => {
    render(<InsightsPanel {...base} initial={insight({ status: "ready", result: null })} />);
    expect(screen.getByText("No insights yet")).toBeInTheDocument();
  });
});
