import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/server/actions/auth";

/**
 * Shown when a signed-in user has no access to the requested area. The copy is identical
 * whether the resource is hidden by RLS or does not exist, so nothing leaks.
 */
export function PermissionDenied() {
  return (
    <main id="main" className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-lg border bg-card p-8 text-center shadow-xs">
        <ShieldAlert className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-semibold">You do not have access to this page</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ask your administrator if you believe you should, or go back to your workspace.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button asChild variant="outline">
            <Link href="/">Go to my workspace</Link>
          </Button>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
