import Link from "next/link";
import { FadeIn } from "@/components/motion/fade-in";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * Phase 0 placeholder. In Phase 1 this route becomes the post-login router
 * (platform admins -> /admin, customer users -> /o/<slug>). It exists now so the
 * baseline build exercises the theme, a shadcn component and the Motion setup.
 */
export default function HomePage() {
  return (
    <main id="main" className="flex flex-1 items-center justify-center px-4 py-16">
      <FadeIn className="w-full max-w-lg">
        <section className="rounded-lg border bg-card p-8 shadow-xs">
          <Badge variant="secondary">Phase 0 · scaffold</Badge>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">TalentFlow</h1>
          <p className="mt-2 text-muted-foreground">
            Multi-tenant applicant tracking for recruiting teams. Sign-in, organizations, jobs,
            candidates and the pipeline are implemented in the next phases. This page only confirms
            that the baseline build, theme and motion setup work.
          </p>
          <div className="mt-6">
            <Button asChild variant="outline">
              <Link href="/api/health">View health endpoint</Link>
            </Button>
          </div>
        </section>
      </FadeIn>
    </main>
  );
}
