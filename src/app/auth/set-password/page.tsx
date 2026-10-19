import type { Metadata } from "next";
import { SetPasswordForm } from "@/components/forms/set-password-form";
import { FadeIn } from "@/components/motion/fade-in";
import { requireUser } from "@/server/auth";

export const metadata: Metadata = { title: "Set your password" };

export default async function SetPasswordPage() {
  const user = await requireUser("/auth/set-password");

  return (
    <main id="main" className="flex flex-1 items-center justify-center px-4 py-16">
      <FadeIn className="w-full max-w-sm">
        <div className="rounded-lg border bg-card p-8 shadow-xs">
          <p className="text-sm font-semibold tracking-tight text-primary">TalentFlow</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Set your password</h1>
          <p className="mt-1 mb-6 text-sm text-muted-foreground">
            Signed in as {user.email}. Choose a password to finish setting up your account.
          </p>
          <SetPasswordForm />
        </div>
      </FadeIn>
    </main>
  );
}
