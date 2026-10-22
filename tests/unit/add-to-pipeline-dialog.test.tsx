// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * "Add candidate" dialog on a job page: when nobody is left to add, it says so and links to
 * the create-candidate form for that job instead of showing an empty select.
 */

vi.mock("@/server/actions/applications", () => ({
  addToPipelineAction: vi.fn(async () => ({ status: "idle" })),
}));

const { AddToPipelineDialog } = await import("@/components/forms/add-to-pipeline-dialog");

afterEach(() => cleanup());

describe("AddToPipelineDialog", () => {
  it("links to the create-candidate form when there is no candidate to pick", async () => {
    render(
      <AddToPipelineDialog
        orgSlug="acme"
        fixed={{ name: "jobId", value: "11111111-1111-4111-8111-111111111111" }}
        choose={{
          name: "candidateId",
          label: "Candidate",
          options: [],
          emptyText: "There are no candidates yet.",
          emptyAction: {
            href: "/o/acme/candidates/new?job=11111111-1111-4111-8111-111111111111",
            label: "Create new candidate",
          },
        }}
        triggerLabel="Add candidate"
        title="Add a candidate to Fullstack Developer"
        description="The candidate starts in the New stage."
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Add candidate" }));
    expect(screen.getByText("There are no candidates yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create new candidate" })).toHaveAttribute(
      "href",
      "/o/acme/candidates/new?job=11111111-1111-4111-8111-111111111111",
    );
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
