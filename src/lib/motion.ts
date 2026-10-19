import type { Transition } from "motion/react";

/**
 * Shared motion tokens (docs/DESIGN.md §5). Every animation in the app uses one of these
 * so the whole product moves with the same rhythm. Durations are in seconds (Motion API).
 */
type CubicBezier = [number, number, number, number];

const standardEase: CubicBezier = [0.2, 0, 0, 1];
const exitEase: CubicBezier = [0.4, 0, 1, 1];

export const motionTokens = {
  duration: { fast: 0.15, base: 0.2, slow: 0.3 },
  ease: { standard: standardEase, exit: exitEase },
  /** Stagger between list rows, in seconds. */
  stagger: 0.03,
} as const;

/** Entering content: decelerate into place. */
export const enterTransition: Transition = {
  duration: motionTokens.duration.base,
  ease: motionTokens.ease.standard,
};

/** Leaving content: shorter than enter so the UI feels responsive. */
export const exitTransition: Transition = {
  duration: motionTokens.duration.fast,
  ease: motionTokens.ease.exit,
};

/** Kanban card settle after drag release. */
export const cardSpring: Transition = { type: "spring", stiffness: 500, damping: 40 };
