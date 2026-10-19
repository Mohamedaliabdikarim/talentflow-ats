// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement, forwardRef } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineCard } from "@/lib/pipeline";

/**
 * Board behaviour without animation: cards land in the right columns, the keyboard
 * "Move to stage" path calls the Server Action with the right arguments, the move is
 * announced, and a failed move reverts.
 */

const moveAction = vi.fn();
const toast = { success: vi.fn(), error: vi.fn() };

vi.mock("@/server/actions/applications", () => ({
  moveApplicationStageAction: (...args: unknown[]) => moveAction(...args),
}));
vi.mock("sonner", () => ({ toast }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

// Motion is replaced by plain elements: animation is not under test and jsdom has no layout.
const MOTION_PROPS = new Set([
  "layout",
  "layoutId",
  "initial",
  "animate",
  "exit",
  "transition",
  "drag",
  "dragSnapToOrigin",
  "dragMomentum",
  "dragElastic",
  "whileDrag",
  "onDragStart",
  "onDrag",
  "onDragEnd",
]);
vi.mock("motion/react", () => {
  // One stable component per tag: a fresh component per render would remount the cards.
  const stubs = new Map<string, React.ComponentType<Record<string, unknown>>>();
  return {
    motion: new Proxy(
      {},
      {
        get: (_target, tag: string) => {
          let stub = stubs.get(tag);
          if (!stub) {
            stub = forwardRef<HTMLElement, Record<string, unknown>>(
              function MotionStub(props, ref) {
                const domProps = Object.fromEntries(
                  Object.entries(props).filter(([key]) => !MOTION_PROPS.has(key)),
                );
                return createElement(tag, { ...domProps, ref });
              },
            );
            stubs.set(tag, stub);
          }
          return stub;
        },
      },
    ),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    LayoutGroup: ({ children }: { children: React.ReactNode }) => children,
  };
});

const { KanbanBoard } = await import("@/components/kanban/kanban-board");

const NOW = Date.parse("2026-10-19T12:00:00Z");

function card(overrides: Partial<PipelineCard>): PipelineCard {
  return {
    id: "app-1",
    stage: "new",
    stageChangedAt: "2026-10-17T12:00:00Z",
    jobId: "job-1",
    jobTitle: "Backend Engineer",
    candidateId: "cand-1",
    candidateName: "Ada Example",
    candidateHeadline: "Senior engineer",
    ...overrides,
  };
}

beforeAll(() => {
  // Radix primitives expect these browser APIs that jsdom lacks.
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(window, "ResizeObserver", { value: ResizeObserverStub, writable: true });
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

beforeEach(() => {
  moveAction.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
});

// Vitest runs without globals, so Testing Library cannot register its own cleanup.
afterEach(cleanup);

const STAGE_NAMES = /^(New|Screening|Interview|Offer|Hired|Rejected)$/;

function column(stageLabel: string) {
  return within(screen.getByRole("listitem", { name: stageLabel }));
}

describe("KanbanBoard", () => {
  it("renders every stage with its cards and counts", () => {
    render(
      <KanbanBoard
        orgSlug="acme"
        now={NOW}
        cards={[
          card({ id: "app-1", stage: "new" }),
          card({
            id: "app-2",
            stage: "interview",
            candidateName: "Bob Example",
            stageChangedAt: "2026-10-19T11:00:00Z",
          }),
        ]}
      />,
    );
    // Columns are the named list items; card <li> elements are list items too but unnamed.
    expect(screen.getAllByRole("listitem", { name: STAGE_NAMES })).toHaveLength(6);
    expect(column("New").getByText("Ada Example")).toBeInTheDocument();
    expect(column("New").getByText("2 days")).toBeInTheDocument();
    expect(column("Interview").getByText("Bob Example")).toBeInTheDocument();
    expect(column("Interview").getByText("today")).toBeInTheDocument();
    expect(column("Offer").getByText("No candidates")).toBeInTheDocument();
    expect(column("New").getByLabelText("1 in New")).toBeInTheDocument();
  });

  it("moves a card through the keyboard menu, calls the action and announces the result", async () => {
    const user = userEvent.setup();
    // Resolve the action by hand: the optimistic placement is visible while it is pending,
    // and the server's refreshed props (not tested here) make it permanent afterwards.
    let resolveMove: (value: unknown) => void = () => {};
    moveAction.mockImplementation(() => new Promise((resolve) => (resolveMove = resolve)));
    render(<KanbanBoard orgSlug="acme" now={NOW} cards={[card({})]} />);

    const trigger = screen.getByRole("button", { name: "Move Ada Example to another stage" });
    trigger.focus();
    await user.keyboard("{Enter}");
    const menu = await screen.findByRole("menu");
    expect(within(menu).queryByRole("menuitem", { name: "New" })).toBeNull();
    await user.click(within(menu).getByRole("menuitem", { name: "Interview" }));

    await waitFor(() =>
      expect(moveAction).toHaveBeenCalledWith("acme", {
        applicationId: "app-1",
        stage: "interview",
      }),
    );
    await waitFor(() => expect(column("Interview").getByText("Ada Example")).toBeInTheDocument());
    expect(column("New").queryByText("Ada Example")).toBeNull();

    resolveMove({ status: "success", message: "Moved to Interview", data: undefined });
    await waitFor(() =>
      expect(screen.getByText("Moved Ada Example to Interview")).toBeInTheDocument(),
    );
    expect(toast.success).toHaveBeenCalledWith("Moved Ada Example to Interview");
  });

  it("reverts the optimistic move and reports the error when the action fails", async () => {
    const user = userEvent.setup();
    moveAction.mockResolvedValue({ status: "error", message: "This application no longer exists" });
    render(<KanbanBoard orgSlug="acme" now={NOW} cards={[card({})]} />);

    screen.getByRole("button", { name: "Move Ada Example to another stage" }).focus();
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("menuitem", { name: "Hired" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("This application no longer exists"),
    );
    await waitFor(() => expect(column("New").getByText("Ada Example")).toBeInTheDocument());
    expect(column("Hired").queryByText("Ada Example")).toBeNull();
    expect(screen.getByText(/Could not move Ada Example/)).toBeInTheDocument();
  });
});
