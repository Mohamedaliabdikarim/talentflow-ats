"use client";

import { motion } from "motion/react";
import { enterTransition } from "@/lib/motion";

type FadeInProps = {
  children: React.ReactNode;
  /** Seconds; use multiples of motionTokens.stagger for lists. */
  delay?: number;
  className?: string;
};

/**
 * Sanctioned page-entrance motion (docs/DESIGN.md §5, use 1): fade plus an 8 px rise.
 * Reduced motion is honoured globally by MotionConfig, which turns this into a plain fade.
 */
export function FadeIn({ children, delay = 0, className }: FadeInProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...enterTransition, delay }}
    >
      {children}
    </motion.div>
  );
}
