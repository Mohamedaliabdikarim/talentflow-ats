import { Skeleton } from "@/components/ui/skeleton";

/**
 * Instant loading state for authenticated pages (ADR-042). Rendered by the route-level
 * `loading.tsx` boundaries, so a navigation shows the page frame at once while the server
 * renders tenant data. Announced to assistive technology once; the skeleton itself is hidden
 * from the accessibility tree. No motion beyond the design system's skeleton pulse.
 */
export function PageSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading page…</span>
      <div aria-hidden="true">
        <div className="mb-6 border-b pb-5">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="mt-2.5 h-4 w-80 max-w-full" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: cards }, (_, index) => (
            <Skeleton key={index} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="mt-6 h-64 rounded-lg" />
      </div>
    </div>
  );
}
