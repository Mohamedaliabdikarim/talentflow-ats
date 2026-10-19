import Link from "next/link";
import { notFound } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { previewResetAction } from "@/preview/actions";
import { isPreviewEnabled } from "@/preview/enabled";

export const dynamic = "force-dynamic";

/**
 * Local preview: the real UI components with synthetic data and no sign-in.
 * A 404 unless preview mode is enabled (development, or TALENTFLOW_PREVIEW=1).
 */
export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  if (!isPreviewEnabled()) notFound();
  return (
    <>
      <div
        role="status"
        className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
      >
        <FlaskConical className="size-4" aria-hidden="true" />
        <span>
          <strong>Local preview</strong> with synthetic data, no sign-in. Kanban moves are kept in
          memory until the dev server restarts; forms are shown but disabled.
        </span>
        <span className="ml-auto flex items-center gap-2">
          <Link href="/preview" className="font-medium underline-offset-4 hover:underline">
            Preview index
          </Link>
          <form action={previewResetAction}>
            <Button type="submit" variant="outline" size="xs">
              Reset demo data
            </Button>
          </form>
        </span>
      </div>
      {children}
    </>
  );
}
