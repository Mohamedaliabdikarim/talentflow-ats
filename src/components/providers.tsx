"use client";

import { MotionConfig } from "motion/react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Client-side providers shared by every page.
 * - ThemeProvider: light/dark through the `.dark` class (system preference by default).
 * - MotionConfig reducedMotion="user": every Motion animation honours prefers-reduced-motion.
 * - TooltipProvider: one provider for all shadcn tooltips.
 * - Toaster: non-focus-stealing toasts (aria-live polite) for action feedback.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <MotionConfig reducedMotion="user">
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
      </MotionConfig>
      <Toaster position="bottom-right" closeButton />
    </ThemeProvider>
  );
}
