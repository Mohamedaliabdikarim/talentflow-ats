// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionState } from "@/lib/action-state";
import type { CandidatePrefill } from "@/lib/ai/candidate-extract-contract";

/**
 * "Add candidate" form (ADR-033/039): the CV stays optional, a chosen PDF triggers extraction
 * that prefills only empty fields, typed values are kept, failures leave the form usable, and
 * the preview can disable extraction. Server Actions are mocked.
 */

type AnyAction<T> = (...args: unknown[]) => Promise<T>;

const createCandidateAction = vi.fn<AnyAction<ActionState>>(async () => ({ status: "idle" }));
const updateCandidateAction = vi.fn<AnyAction<ActionState>>(async () => ({ status: "idle" }));
vi.mock("@/server/actions/candidates", () => ({
  createCandidateAction: (...args: unknown[]) => createCandidateAction(...args),
  updateCandidateAction: (...args: unknown[]) => updateCandidateAction(...args),
}));
const extractCandidateDetailsAction = vi.fn<AnyAction<ActionState<CandidatePrefill>>>(async () => ({
  status: "idle",
}));
vi.mock("@/server/actions/candidate-extract", () => ({
  extractCandidateDetailsAction: (...args: unknown[]) => extractCandidateDetailsAction(...args),
}));

const { CandidateForm } = await import("@/components/forms/candidate-form");

const PDF = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], "alex-cv.pdf", {
  type: "application/pdf",
});

function success(
  values: CandidatePrefill["values"],
  warnings: string[] = [],
): ActionState<CandidatePrefill> {
  return {
    status: "success",
    message: "Details extracted from the CV. Review and correct them before saving.",
    data: { values, warnings },
  };
}

const cvInput = () => screen.getByLabelText("CV (PDF, optional)") as HTMLInputElement;
const value = (label: string | RegExp) =>
  (screen.getByLabelText(label) as HTMLInputElement | HTMLTextAreaElement).value;
const submitButton = () => screen.getByRole("button", { name: "Add candidate" });

beforeEach(() => {
  createCandidateAction.mockClear();
  extractCandidateDetailsAction.mockReset();
});
afterEach(cleanup);

describe("CandidateForm — CV is optional", () => {
  it("renders the CV input as optional and submits without a file", async () => {
    render(<CandidateForm orgSlug="acme" />);
    expect(cvInput()).not.toBeRequired();
    expect(screen.getByText(/You can add a candidate without a CV/)).toBeInTheDocument();
    expect(screen.getByText(/Uploading does not authorize AI analysis/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/Full name/), "Manual Entry");
    fireEvent.submit(submitButton().closest("form")!);
    await waitFor(() => expect(createCandidateAction).toHaveBeenCalledTimes(1));
    expect(extractCandidateDetailsAction).not.toHaveBeenCalled();
    const formData = createCandidateAction.mock.calls[0]![2] as FormData;
    expect(formData.get("fullName")).toBe("Manual Entry");
    const file = formData.get("cv");
    expect(!(file instanceof File) || file.size === 0).toBe(true);
  });

  it("does not offer or run extraction when it is disabled (preview)", async () => {
    render(<CandidateForm orgSlug="acme" extractAction={null} />);
    expect(screen.queryByText(/read automatically to prefill/)).not.toBeInTheDocument();
    await userEvent.upload(cvInput(), PDF);
    expect(extractCandidateDetailsAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("CandidateForm — automatic extraction from a chosen CV", () => {
  it("extracts on file choice, prefills only empty fields, keeps typed values, and lists what it filled", async () => {
    let finish: (result: ActionState<CandidatePrefill>) => void = () => {};
    extractCandidateDetailsAction.mockImplementation(
      () =>
        new Promise<ActionState<CandidatePrefill>>((resolve) => {
          finish = resolve;
        }),
    );
    render(<CandidateForm orgSlug="acme" />);
    await userEvent.type(screen.getByLabelText(/Full name/), "Typed Name");

    await userEvent.upload(cvInput(), PDF);
    expect(await screen.findByText(/Reading the CV to prefill the form/)).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
    expect(extractCandidateDetailsAction).toHaveBeenCalledTimes(1);
    const [orgSlug, formData] = extractCandidateDetailsAction.mock.calls[0] as [string, FormData];
    expect(orgSlug).toBe("acme");
    expect((formData.get("cv") as File).name).toBe("alex-cv.pdf");

    finish(
      success(
        {
          fullName: "Alex Example",
          email: "alex@example.test",
          headline: "Senior backend engineer",
          githubUrl: "https://github.com/alexexample",
        },
        ["A LinkedIn link in the CV was not a valid profile URL and was left empty."],
      ),
    );
    await screen.findByText(/Details extracted from the CV/);
    expect(value(/Full name/)).toBe("Typed Name");
    expect(value("Email")).toBe("alex@example.test");
    expect(value("Headline")).toBe("Senior backend engineer");
    expect(value("GitHub profile URL")).toBe("https://github.com/alexexample");
    expect(value("LinkedIn profile URL")).toBe("");
    expect(
      screen.getByText(/Prefilled from the CV: Headline, Email, GitHub profile URL\./),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Fields you had already filled in were left unchanged/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/LinkedIn link in the CV was not a valid profile URL/),
    ).toBeInTheDocument();
    // The transition settles a render later; the form then re-enables for the save.
    await waitFor(() => expect(submitButton()).toBeEnabled());
    expect(cvInput()).toBeEnabled();
    // The chosen file is still attached for the save.
    expect(cvInput().files?.[0]?.name).toBe("alex-cv.pdf");
  });

  it("keeps the form usable and the file attached when extraction fails", async () => {
    extractCandidateDetailsAction.mockResolvedValue({
      status: "error",
      message: "AI extraction is not configured in this environment. Enter the details manually.",
    });
    render(<CandidateForm orgSlug="acme" />);
    await userEvent.upload(cvInput(), PDF);
    expect(await screen.findByText(/AI extraction is not configured/)).toBeInTheDocument();
    expect(
      screen.getByText(/You can still enter the details manually and save with the CV/),
    ).toBeInTheDocument();
    await waitFor(() => expect(submitButton()).toBeEnabled());
    expect(cvInput().files?.[0]?.name).toBe("alex-cv.pdf");
    expect(value(/Full name/)).toBe("");
  });

  it("never prefills notes and reports when nothing was found", async () => {
    extractCandidateDetailsAction.mockResolvedValue({
      status: "success",
      message: "No contact details were found in the CV. Enter them manually.",
      data: { values: {}, warnings: [] },
    });
    render(<CandidateForm orgSlug="acme" />);
    await userEvent.upload(cvInput(), PDF);
    expect(await screen.findByText(/No contact details were found/)).toBeInTheDocument();
    expect(screen.queryByText(/Prefilled from the CV/)).not.toBeInTheDocument();
    expect(value("Notes")).toBe("");
  });
});

describe("CandidateForm — edit mode", () => {
  it("has no CV input and never extracts", () => {
    render(
      <CandidateForm
        orgSlug="acme"
        candidate={{
          id: "c1",
          full_name: "Alex Example",
          email: null,
          phone: null,
          headline: null,
          location: null,
          linkedin_url: null,
          github_url: "https://github.com/alexexample",
          notes: null,
        }}
      />,
    );
    expect(screen.queryByLabelText("CV (PDF, optional)")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
    expect(
      screen.getByText(/needs a separate authorization on the candidate page/),
    ).toBeInTheDocument();
  });
});
