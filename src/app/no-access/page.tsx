import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/server/actions/auth";
import { requireUser } from "@/server/auth";

export const metadata: Metadata = { title: "No workspace" };

/** Signed in, but not a member of any organization and not a platform admin. */
export default async function NoAccessPage() {
  const user = await requireUser("/no-access");
  return (
    <main id="main" className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-lg border bg-card p-8 text-center shadow-xs">
        <h1 className="text-xl font-semibold">No workspace yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {user.email} is signed in but has not been added to an organization. Ask the person who
          invited you to add you to their workspace.
        </p>
        <form action={signOutAction} className="mt-6">
          <Button type="submit" variant="outline">
            Sign out
          </Button>
        </form>
      </div>
    </main>
  );
}
