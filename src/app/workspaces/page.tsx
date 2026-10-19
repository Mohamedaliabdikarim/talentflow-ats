import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/server/actions/auth";
import { getMyOrganizations, requireUser } from "@/server/auth";

export const metadata: Metadata = { title: "Choose a workspace" };

export default async function WorkspacesPage() {
  await requireUser("/workspaces");
  const organizations = await getMyOrganizations();

  return (
    <main id="main" className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-lg border bg-card p-8 shadow-xs">
        <h1 className="text-xl font-semibold">Choose a workspace</h1>
        <ul className="mt-4 divide-y">
          {organizations.map((organization) => (
            <li key={organization.id}>
              <Link
                href={`/o/${organization.slug}`}
                className="flex items-center justify-between py-3 text-sm font-medium hover:text-primary"
              >
                {organization.name}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
        <form action={signOutAction} className="mt-6">
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </div>
    </main>
  );
}
