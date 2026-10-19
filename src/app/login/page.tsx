import type { Metadata } from "next";
import { LoginForm } from "@/components/forms/login-form";
import { FadeIn } from "@/components/motion/fade-in";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { safeRedirectPath } from "@/lib/validation/auth";

export const metadata: Metadata = { title: "Sign in" };

const LINK_ERRORS: Record<string, string> = {
  invalid_link: "That link is not valid. Ask your administrator for a new invitation.",
  expired_link:
    "That link has expired or was already used. Ask your administrator for a new invitation.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next, "");
  const linkError = params.error ? LINK_ERRORS[params.error] : undefined;

  return (
    <main id="main" className="flex flex-1 items-center justify-center px-4 py-16">
      <FadeIn className="w-full max-w-sm">
        <div className="rounded-lg border bg-card p-8 shadow-xs">
          <p className="text-sm font-semibold tracking-tight text-primary">TalentFlow</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 mb-6 text-sm text-muted-foreground">
            Accounts are created by invitation. Use the email and password you set up.
          </p>
          {linkError ? (
            <Alert variant="destructive" className="mb-4" role="alert">
              <AlertDescription>{linkError}</AlertDescription>
            </Alert>
          ) : null}
          <LoginForm next={next || undefined} />
        </div>
      </FadeIn>
    </main>
  );
}
