// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PageSkeleton } from "@/components/page-skeleton";

/** Loading boundary skeleton (ADR-042): announced once, decorative parts hidden. */

afterEach(cleanup);

describe("PageSkeleton", () => {
  it("is a polite, busy status region with a text announcement and hidden placeholders", () => {
    render(<PageSkeleton cards={3} />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Loading page…")).toHaveClass("sr-only");
    expect(status.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});
