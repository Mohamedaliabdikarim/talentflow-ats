// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The pending-invite resend control (ADR-031): it submits the membership id, shows the
 * one-time link on success, and shows the error message (keeping the button) on failure.
 */

const reissue = vi.fn();
vi.mock("@/server/actions/admin", () => ({
  reissueInvitationAction: (...args: unknown[]) => reissue(...args),
}));

const { ResendInviteButton } = await import("@/components/forms/resend-invite-button");

afterEach(() => {
  cleanup();
  reissue.mockReset();
});

describe("ResendInviteButton", () => {
  it("submits the membership id and shows the one-time link on success", async () => {
    reissue.mockResolvedValue({
      status: "success",
      message: "New invitation link created. Copy it now; it is shown only once.",
      data: {
        inviteUrl:
          "http://localhost:3000/auth/confirm?token_hash=tok-abc&type=invite&next=%2Fauth%2Fset-password",
        linkType: "invite",
        existingUser: false,
      },
    });

    render(<ResendInviteButton membershipId="m-1" />);
    await userEvent.click(screen.getByRole("button", { name: "Resend invite" }));

    await screen.findByText("New invitation link");
    const input = screen.getByLabelText("Invitation link") as HTMLInputElement;
    expect(input.value).toContain("token_hash=tok-abc");
    expect(input.value).toContain("next=%2Fauth%2Fset-password");

    const formData = reissue.mock.calls[0][1] as FormData;
    expect(formData.get("membershipId")).toBe("m-1");
  });

  it("shows the error and keeps the control when the reissue is refused", async () => {
    reissue.mockResolvedValue({
      status: "error",
      message: "That member is already active, so there is no pending invitation to resend.",
    });

    render(<ResendInviteButton membershipId="m-2" />);
    await userEvent.click(screen.getByRole("button", { name: "Resend invite" }));

    await screen.findByText(/already active/);
    expect(screen.getByRole("button", { name: "Resend invite" })).toBeTruthy();
    // No link is rendered on failure.
    expect(screen.queryByText("New invitation link")).toBeNull();
  });
});
