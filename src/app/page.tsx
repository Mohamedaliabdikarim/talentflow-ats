import type { Metadata } from "next";
import { LandingNav } from "@/components/landing/landing-nav";
import {
  AiSection,
  CtaSection,
  FactsStrip,
  FeatureStory,
  Hero,
  LandingFooter,
} from "@/components/landing/sections";
import { getCurrentUser } from "@/server/auth";

const TITLE = "TalentFlow — Hire with clarity. Move talent forward.";
const DESCRIPTION =
  "Multi-tenant applicant tracking for recruiting teams: post jobs, keep every candidate in one place, and move applications through a compact, keyboard-accessible pipeline.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    siteName: "TalentFlow",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

/**
 * Public landing page. Signed-in visitors get "Open app" instead of sign-in CTAs;
 * the post-login router lives at /app.
 */
export default async function LandingPage() {
  const user = await getCurrentUser();
  const signedIn = Boolean(user);

  return (
    <div className="landing dark flex min-h-full flex-1 flex-col bg-background text-foreground">
      <LandingNav signedIn={signedIn} />
      <main id="main" className="flex-1">
        <Hero signedIn={signedIn} />
        <FactsStrip />
        <FeatureStory />
        <AiSection />
        <CtaSection signedIn={signedIn} />
      </main>
      <LandingFooter />
    </div>
  );
}
