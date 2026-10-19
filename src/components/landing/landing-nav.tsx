"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "cn";
import { LogoMark } from "@/components/landing/logo";
import { LANDING_SECTIONS } from "@/components/landing/sections-data";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/**
 * Fixed top navigation. Transparent over the hero, then gains a blurred navy backdrop
 * once the page scrolls, so the wordmark and CTAs stay legible over any section.
 */
export function LandingNav({ signedIn }: { signedIn: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 8);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  const ctas = signedIn ? (
    <Button asChild>
      <Link href="/app">Open app</Link>
    </Button>
  ) : (
    <>
      <Button asChild variant="ghost">
        <Link href="/login">Sign in</Link>
      </Button>
      <Button asChild>
        <Link href="/login">Get started</Link>
      </Button>
    </>
  );

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 border-b transition-[background-color,border-color] duration-200",
        scrolled
          ? "border-white/10 bg-[#070a12]/80 backdrop-blur-md supports-[backdrop-filter]:bg-[#070a12]/65"
          : "border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-[15px] font-semibold tracking-tight focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <LogoMark id="tf-mark-nav" />
          TalentFlow
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {LANDING_SECTIONS.map((section) => (
            <a
              key={section.href}
              href={section.href}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {section.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-2 md:flex">{ctas}</div>
        <div className="ml-auto md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="landing dark w-80 border-white/10">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <LogoMark id="tf-mark-sheet" />
                  TalentFlow
                </SheetTitle>
              </SheetHeader>
              <nav aria-label="Primary" className="flex flex-col gap-1 px-2">
                {LANDING_SECTIONS.map((section) => (
                  <a
                    key={section.href}
                    href={section.href}
                    onClick={() => setOpen(false)}
                    className="rounded-md px-3 py-2.5 text-base text-foreground/90 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {section.label}
                  </a>
                ))}
              </nav>
              <div className="mt-4 flex flex-col gap-2 px-2">{ctas}</div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
