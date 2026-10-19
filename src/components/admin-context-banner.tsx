import Link from "next/link";
import { ShieldCheck } from "lucide-react";

/** Persistent reminder that the current workspace is opened with platform-admin authority. */
export function AdminContextBanner({ organizationName }: { organizationName: string }) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-accent px-4 py-2 text-sm text-accent-foreground md:px-8"
    >
      <ShieldCheck className="size-4" aria-hidden="true" />
      <span>
        Acting in <strong>{organizationName}</strong> as platform admin. Your actions are audited.
      </span>
      <Link href="/admin" className="ml-auto font-medium underline-offset-4 hover:underline">
        Back to admin
      </Link>
    </div>
  );
}
