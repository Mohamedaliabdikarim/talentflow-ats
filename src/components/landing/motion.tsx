"use client";

import { motion, type Variants } from "motion/react";
import { enterTransition, motionTokens } from "@/lib/motion";

/**
 * Landing-page motion (docs/DESIGN.md §5): entrance and scroll-reveal only, transform and
 * opacity only, honoured by the global MotionConfig reducedMotion="user".
 *
 * Every animated wrapper carries data-reveal so the <noscript> rule in the landing page
 * can force it visible when JavaScript is unavailable (Motion server-renders the hidden
 * initial state otherwise).
 */

const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: motionTokens.stagger * 3 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { ...enterTransition, duration: 0.45 } },
};

/** Staggered entrance for the hero copy. Children are plain elements wrapped by HeroItem. */
export function HeroStagger({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div className={className} variants={container} initial="hidden" animate="visible">
      {children}
    </motion.div>
  );
}

export function HeroItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div data-reveal className={className} variants={item}>
      {children}
    </motion.div>
  );
}

/** Fade-and-rise when a section scrolls into view; runs once. */
export function Reveal({
  children,
  className,
  delay = 0,
  scale = false,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  /** Adds a subtle 0.98 → 1 scale, used for the product showcase frame. */
  scale?: boolean;
}) {
  return (
    <motion.div
      data-reveal
      className={className}
      initial={{ opacity: 0, y: 18, scale: scale ? 0.98 : 1 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ ...enterTransition, duration: 0.5, delay }}
    >
      {children}
    </motion.div>
  );
}
