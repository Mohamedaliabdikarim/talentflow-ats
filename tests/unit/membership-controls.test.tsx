// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActionState } from "@/lib/action-state";

/** Membership controls (ADR-040): the right controls per status, deactivation confirms first. */

vi.mock("@/server/actions/memberships", () => ({
  changeMembershipRoleAction: vi.fn(async (): Promise<ActionState> => ({ status: "idle" })),
  setMembershipStatusAction: vi.fn(async (): Promise<ActionState> => ({ status: "idle" })),
}));

const { MembershipControls } = await import("@/components/forms/membership-controls");

const base = { organizationId: "org-1", membershipId: "m-1" };

afterEach(cleanup);

describe("MembershipControls", () => {
  it("offers 'Make owner' and a two-step deactivate for an active member", async () => {
    render(<MembershipControls {...base} role="member" status="active" />);
    expect(screen.getByRole("button", { name: "Make owner" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm deactivate" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    expect(screen.getByRole("button", { name: "Confirm deactivate" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("button", { name: "Confirm deactivate" })).not.toBeInTheDocument();
  });

  it("offers 'Make member' for an active owner", () => {
    render(<MembershipControls {...base} role="owner" status="active" />);
    expect(screen.getByRole("button", { name: "Make member" })).toBeInTheDocument();
  });

  it("offers only Reactivate for a deactivated membership", () => {
    render(<MembershipControls {...base} role="member" status="disabled" />);
    expect(screen.getByRole("button", { name: "Reactivate" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Make/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deactivate" })).not.toBeInTheDocument();
  });

  it("shows no management controls for a pending invitation", () => {
    render(<MembershipControls {...base} role="member" status="invited" />);
    expect(screen.getByText("Pending invitation")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
